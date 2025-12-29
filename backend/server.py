from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator
import re
from typing import List, Optional
import uuid
from datetime import datetime
import hashlib
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Password hashing
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, hash_value = hashed.split(":")
        return hashlib.sha256((password + salt).encode()).hexdigest() == hash_value
    except:
        return False

# Models
class UserCreate(BaseModel):
    phone: str
    name: str
    password: str
    
    @validator('phone')
    def validate_phone(cls, v):
        if not v.startswith('+998'):
            raise ValueError('Phone number must start with +998')
        # Remove spaces and dashes
        cleaned = re.sub(r'[\s-]', '', v)
        if len(cleaned) != 13:  # +998 + 9 digits
            raise ValueError('Phone number must be 13 characters (+998 followed by 9 digits)')
        if not cleaned[4:].isdigit():
            raise ValueError('Phone number must contain only digits after +998')
        return cleaned

class UserLogin(BaseModel):
    phone: str
    password: str

class UserResponse(BaseModel):
    id: str
    phone: str
    name: str
    avatar: Optional[str] = None
    total_distance: float = 0.0
    is_admin: bool = False
    created_at: datetime

class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class RunCreate(BaseModel):
    route: List[dict]  # [{lat, lng, timestamp}]
    distance: float  # in km
    duration: int  # in seconds
    start_time: datetime
    end_time: datetime

class RunResponse(BaseModel):
    id: str
    user_id: str
    route: List[dict]
    distance: float
    duration: int
    start_time: datetime
    end_time: datetime
    created_at: datetime

class TerritoryResponse(BaseModel):
    user_id: str
    user_name: str
    user_phone: str
    user_avatar: Optional[str]
    total_distance: float
    runs: List[RunResponse]

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: str
    name: str
    phone: str
    avatar: Optional[str]
    total_distance: float

# Helper function to get current user from token
async def get_current_user(token: str) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = await db.users.find_one({"id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# Routes
@api_router.get("/")
async def root():
    return {"message": "Yugur API - Running & Territory App"}

@api_router.post("/auth/register", response_model=dict)
async def register(user: UserCreate):
    # Check if phone already exists
    existing = await db.users.find_one({"phone": user.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "phone": user.phone,
        "name": user.name,
        "password": hash_password(user.password),
        "avatar": None,
        "total_distance": 0.0,
        "is_admin": False,
        "created_at": datetime.utcnow()
    }
    
    await db.users.insert_one(user_doc)
    
    # Create session token
    token = secrets.token_hex(32)
    await db.sessions.insert_one({
        "token": token,
        "user_id": user_id,
        "created_at": datetime.utcnow()
    })
    
    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone": user.phone,
            "name": user.name,
            "avatar": None,
            "total_distance": 0.0,
            "is_admin": False,
            "created_at": user_doc["created_at"].isoformat()
        }
    }

@api_router.post("/auth/login", response_model=dict)
async def login(credentials: UserLogin):
    # Clean phone number
    phone = re.sub(r'[\s-]', '', credentials.phone)
    
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    # Create session token
    token = secrets.token_hex(32)
    await db.sessions.insert_one({
        "token": token,
        "user_id": user["id"],
        "created_at": datetime.utcnow()
    })
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "phone": user["phone"],
            "name": user["name"],
            "avatar": user.get("avatar"),
            "total_distance": user.get("total_distance", 0.0),
            "is_admin": user.get("is_admin", False),
            "created_at": user["created_at"].isoformat()
        }
    }

@api_router.post("/auth/logout")
async def logout(token: str):
    await db.sessions.delete_many({"token": token})
    return {"message": "Logged out successfully"}

@api_router.get("/users/me", response_model=dict)
async def get_me(token: str):
    user = await get_current_user(token)
    return {
        "id": user["id"],
        "phone": user["phone"],
        "name": user["name"],
        "avatar": user.get("avatar"),
        "total_distance": user.get("total_distance", 0.0),
        "is_admin": user.get("is_admin", False),
        "created_at": user["created_at"].isoformat()
    }

@api_router.put("/users/me", response_model=dict)
async def update_me(token: str, update: UserUpdate):
    user = await get_current_user(token)
    
    update_doc = {}
    if update.name:
        update_doc["name"] = update.name
    if update.avatar is not None:
        update_doc["avatar"] = update.avatar
    
    if update_doc:
        await db.users.update_one({"id": user["id"]}, {"$set": update_doc})
    
    updated_user = await db.users.find_one({"id": user["id"]})
    return {
        "id": updated_user["id"],
        "phone": updated_user["phone"],
        "name": updated_user["name"],
        "avatar": updated_user.get("avatar"),
        "total_distance": updated_user.get("total_distance", 0.0),
        "is_admin": updated_user.get("is_admin", False),
        "created_at": updated_user["created_at"].isoformat()
    }

@api_router.post("/users/change-password")
async def change_password(token: str, data: PasswordChange):
    user = await get_current_user(token)
    
    if not verify_password(data.old_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    new_hashed = hash_password(data.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": new_hashed}})
    
    return {"message": "Password changed successfully"}

@api_router.post("/runs", response_model=dict)
async def create_run(token: str, run: RunCreate):
    user = await get_current_user(token)
    
    run_id = str(uuid.uuid4())
    run_doc = {
        "id": run_id,
        "user_id": user["id"],
        "route": run.route,
        "distance": run.distance,
        "duration": run.duration,
        "start_time": run.start_time,
        "end_time": run.end_time,
        "created_at": datetime.utcnow()
    }
    
    await db.runs.insert_one(run_doc)
    
    # Update user's total distance
    new_total = user.get("total_distance", 0.0) + run.distance
    await db.users.update_one({"id": user["id"]}, {"$set": {"total_distance": new_total}})
    
    return {
        "id": run_id,
        "user_id": user["id"],
        "route": run.route,
        "distance": run.distance,
        "duration": run.duration,
        "start_time": run.start_time.isoformat(),
        "end_time": run.end_time.isoformat(),
        "created_at": run_doc["created_at"].isoformat()
    }

@api_router.get("/runs/me", response_model=List[dict])
async def get_my_runs(token: str):
    user = await get_current_user(token)
    
    runs = await db.runs.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    
    return [{
        "id": run["id"],
        "user_id": run["user_id"],
        "route": run["route"],
        "distance": run["distance"],
        "duration": run["duration"],
        "start_time": run["start_time"].isoformat() if isinstance(run["start_time"], datetime) else run["start_time"],
        "end_time": run["end_time"].isoformat() if isinstance(run["end_time"], datetime) else run["end_time"],
        "created_at": run["created_at"].isoformat()
    } for run in runs]

@api_router.get("/territories", response_model=List[dict])
async def get_all_territories():
    """Get all users' territories with their runs"""
    users = await db.users.find().to_list(1000)
    territories = []
    
    for user in users:
        runs = await db.runs.find({"user_id": user["id"]}).to_list(100)
        runs_data = [{
            "id": run["id"],
            "user_id": run["user_id"],
            "route": run["route"],
            "distance": run["distance"],
            "duration": run["duration"],
            "start_time": run["start_time"].isoformat() if isinstance(run["start_time"], datetime) else run["start_time"],
            "end_time": run["end_time"].isoformat() if isinstance(run["end_time"], datetime) else run["end_time"],
            "created_at": run["created_at"].isoformat()
        } for run in runs]
        
        territories.append({
            "user_id": user["id"],
            "user_name": user["name"],
            "user_phone": user["phone"],
            "user_avatar": user.get("avatar"),
            "total_distance": user.get("total_distance", 0.0),
            "runs": runs_data
        })
    
    return territories

@api_router.get("/leaderboard", response_model=List[dict])
async def get_leaderboard():
    """Get users ranked by total distance"""
    users = await db.users.find().sort("total_distance", -1).to_list(100)
    
    leaderboard = []
    for i, user in enumerate(users):
        leaderboard.append({
            "rank": i + 1,
            "user_id": user["id"],
            "name": user["name"],
            "phone": user["phone"],
            "avatar": user.get("avatar"),
            "total_distance": user.get("total_distance", 0.0)
        })
    
    return leaderboard

@api_router.get("/admin/users", response_model=List[dict])
async def get_all_users(token: str):
    """Admin only: Get all users"""
    user = await get_current_user(token)
    
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await db.users.find().sort("total_distance", -1).to_list(1000)
    
    result = []
    for i, u in enumerate(users):
        result.append({
            "rank": i + 1,
            "id": u["id"],
            "name": u["name"],
            "phone": u["phone"],
            "avatar": u.get("avatar"),
            "total_distance": u.get("total_distance", 0.0),
            "is_admin": u.get("is_admin", False),
            "created_at": u["created_at"].isoformat()
        })
    
    return result

@api_router.post("/admin/make-admin")
async def make_admin(token: str, user_id: str):
    """Admin only: Make another user admin"""
    user = await get_current_user(token)
    
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_admin": True}})
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User is now admin"}

# Create first admin user if none exists
@app.on_event("startup")
async def create_admin_user():
    admin = await db.users.find_one({"is_admin": True})
    if not admin:
        # Create default admin
        admin_doc = {
            "id": str(uuid.uuid4()),
            "phone": "+998901234567",
            "name": "Admin",
            "password": hash_password("admin123"),
            "avatar": None,
            "total_distance": 0.0,
            "is_admin": True,
            "created_at": datetime.utcnow()
        }
        await db.users.insert_one(admin_doc)
        logging.info("Default admin created: +998901234567 / admin123")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
