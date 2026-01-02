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
from enum import Enum

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

# Admin secret code
ADMIN_SECRET_CODE = "admin00393bbd8"

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

# Enums
class NotificationType(str, Enum):
    WARNING = "warning"
    INFO = "info"
    REWARD = "reward"

class RestrictionType(str, Enum):
    RUN_BLOCKED = "run_blocked"
    MAP_HIDDEN = "map_hidden"
    SUSPENDED = "suspended"

# Models
class UserCreate(BaseModel):
    phone: str
    name: str
    password: str
    
    @validator('phone')
    def validate_phone(cls, v):
        if not v.startswith('+998'):
            raise ValueError('Phone number must start with +998')
        cleaned = re.sub(r'[\s-]', '', v)
        if len(cleaned) != 13:
            raise ValueError('Phone number must be 13 characters (+998 followed by 9 digits)')
        if not cleaned[4:].isdigit():
            raise ValueError('Phone number must contain only digits after +998')
        return cleaned

class UserLogin(BaseModel):
    phone: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    route_color: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class RunCreate(BaseModel):
    route: List[dict]
    distance: float
    duration: int
    start_time: datetime
    end_time: datetime

class AdminVerify(BaseModel):
    admin_code: str

class NotificationCreate(BaseModel):
    user_id: Optional[str] = None  # None = broadcast to all
    type: NotificationType
    title: str
    message: str
    reason: Optional[str] = None

class RewardCreate(BaseModel):
    user_id: str
    amount: int  # 100000, 200000, 500000
    reason: str

class UserRestriction(BaseModel):
    user_id: str
    restriction_type: RestrictionType
    reason: str
    duration_hours: Optional[int] = None  # None = permanent

class RemoveRestriction(BaseModel):
    user_id: str
    restriction_type: RestrictionType

# Helper functions
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

async def verify_admin_code(admin_code: str) -> bool:
    return admin_code == ADMIN_SECRET_CODE

async def log_admin_action(admin_id: str, action_type: str, target_user_id: str = None, details: dict = None):
    """Log all admin actions for security"""
    log_entry = {
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "action_type": action_type,
        "target_user_id": target_user_id,
        "details": details or {},
        "timestamp": datetime.utcnow()
    }
    await db.admin_logs.insert_one(log_entry)

def calculate_territory_size(total_distance: float) -> dict:
    """Calculate approximate territory size based on distance"""
    # Rough estimation: territory area grows with distance
    area_km2 = total_distance * 0.1
    if area_km2 < 1:
        return {"value": round(area_km2 * 1000000), "unit": "m²"}
    return {"value": round(area_km2, 2), "unit": "km²"}

# ==================== AUTH ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Yugur API - Running & Territory App"}

@api_router.post("/auth/register")
async def register(user: UserCreate):
    existing = await db.users.find_one({"phone": user.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Bu nomer dan oldin foydalanilgan")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "phone": user.phone,
        "name": user.name,
        "password": hash_password(user.password),
        "avatar": None,
        "total_distance": 0.0,
        "is_admin": False,
        "restrictions": [],
        "rewards": [],
        "created_at": datetime.utcnow()
    }
    
    await db.users.insert_one(user_doc)
    
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
            "restrictions": [],
            "created_at": user_doc["created_at"].isoformat()
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    phone = re.sub(r'[\s-]', '', credentials.phone)
    
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    # Check if suspended
    restrictions = user.get("restrictions", [])
    for r in restrictions:
        if r.get("type") == "suspended" and r.get("active", False):
            raise HTTPException(status_code=403, detail="Your account has been suspended")
    
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
            "restrictions": user.get("restrictions", []),
            "created_at": user["created_at"].isoformat()
        }
    }

@api_router.post("/auth/logout")
async def logout(token: str):
    await db.sessions.delete_many({"token": token})
    return {"message": "Logged out successfully"}

# ==================== USER ROUTES ====================

@api_router.get("/users/me")
async def get_me(token: str):
    user = await get_current_user(token)
    
    # Get unread notifications
    notifications = await db.notifications.find({
        "$or": [
            {"user_id": user["id"]},
            {"user_id": None}  # Broadcast notifications
        ],
        "read_by": {"$ne": user["id"]}
    }).sort("created_at", -1).to_list(50)
    
    return {
        "id": user["id"],
        "phone": user["phone"],
        "name": user["name"],
        "avatar": user.get("avatar"),
        "total_distance": user.get("total_distance", 0.0),
        "is_admin": user.get("is_admin", False),
        "restrictions": user.get("restrictions", []),
        "rewards": user.get("rewards", []),
        "unread_notifications": len(notifications),
        "created_at": user["created_at"].isoformat()
    }

@api_router.put("/users/me")
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
        "restrictions": updated_user.get("restrictions", []),
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

# ==================== NOTIFICATIONS ROUTES ====================

@api_router.get("/notifications")
async def get_notifications(token: str):
    user = await get_current_user(token)
    
    notifications = await db.notifications.find({
        "$or": [
            {"user_id": user["id"]},
            {"user_id": None}
        ]
    }).sort("created_at", -1).to_list(100)
    
    return [{
        "id": n["id"],
        "type": n["type"],
        "title": n["title"],
        "message": n["message"],
        "reason": n.get("reason"),
        "is_read": user["id"] in n.get("read_by", []),
        "created_at": n["created_at"].isoformat()
    } for n in notifications]

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, token: str):
    user = await get_current_user(token)
    
    await db.notifications.update_one(
        {"id": notification_id},
        {"$addToSet": {"read_by": user["id"]}}
    )
    
    return {"message": "Notification marked as read"}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(token: str):
    user = await get_current_user(token)
    
    await db.notifications.update_many(
        {"$or": [{"user_id": user["id"]}, {"user_id": None}]},
        {"$addToSet": {"read_by": user["id"]}}
    )
    
    return {"message": "All notifications marked as read"}

# ==================== RUN ROUTES ====================

@api_router.post("/runs")
async def create_run(token: str, run: RunCreate):
    user = await get_current_user(token)
    
    # Check if user is restricted from running
    restrictions = user.get("restrictions", [])
    for r in restrictions:
        if r.get("type") == "run_blocked" and r.get("active", False):
            raise HTTPException(status_code=403, detail="You are currently restricted from starting runs")
    
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

@api_router.get("/runs/me")
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

@api_router.get("/territories")
async def get_all_territories():
    users = await db.users.find().to_list(1000)
    territories = []
    
    for user in users:
        # Check if user is hidden from map
        restrictions = user.get("restrictions", [])
        is_hidden = any(r.get("type") == "map_hidden" and r.get("active", False) for r in restrictions)
        
        if is_hidden:
            continue
            
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

@api_router.get("/leaderboard")
async def get_leaderboard():
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

# ==================== ADMIN ROUTES ====================

@api_router.post("/admin/verify")
async def verify_admin(data: AdminVerify):
    """Verify admin code"""
    if data.admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    return {"message": "Admin access granted", "valid": True}

@api_router.get("/admin/users")
async def get_all_users(token: str, admin_code: str):
    """Get all users with detailed info - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    user = await get_current_user(token)
    
    users = await db.users.find().sort("total_distance", -1).to_list(1000)
    
    result = []
    for i, u in enumerate(users):
        territory = calculate_territory_size(u.get("total_distance", 0.0))
        runs_count = await db.runs.count_documents({"user_id": u["id"]})
        
        result.append({
            "rank": i + 1,
            "id": u["id"],
            "name": u["name"],
            "phone": u["phone"],
            "avatar": u.get("avatar"),
            "total_distance": u.get("total_distance", 0.0),
            "territory_size": territory,
            "runs_count": runs_count,
            "restrictions": u.get("restrictions", []),
            "rewards": u.get("rewards", []),
            "is_admin": u.get("is_admin", False),
            "created_at": u["created_at"].isoformat()
        })
    
    return result

@api_router.get("/admin/user/{user_id}")
async def get_user_details(user_id: str, token: str, admin_code: str):
    """Get detailed user info - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    runs = await db.runs.find({"user_id": user_id}).sort("created_at", -1).to_list(100)
    notifications = await db.notifications.find({"user_id": user_id}).to_list(100)
    
    # Get rank
    all_users = await db.users.find().sort("total_distance", -1).to_list(1000)
    rank = next((i + 1 for i, u in enumerate(all_users) if u["id"] == user_id), 0)
    
    territory = calculate_territory_size(user.get("total_distance", 0.0))
    
    return {
        "id": user["id"],
        "name": user["name"],
        "phone": user["phone"],
        "avatar": user.get("avatar"),
        "total_distance": user.get("total_distance", 0.0),
        "territory_size": territory,
        "rank": rank,
        "runs_count": len(runs),
        "restrictions": user.get("restrictions", []),
        "rewards": user.get("rewards", []),
        "notifications_sent": len(notifications),
        "created_at": user["created_at"].isoformat()
    }

@api_router.post("/admin/notification")
async def send_notification(token: str, admin_code: str, notification: NotificationCreate):
    """Send notification/warning - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    admin = await get_current_user(token)
    
    notification_id = str(uuid.uuid4())
    notification_doc = {
        "id": notification_id,
        "user_id": notification.user_id,  # None for broadcast
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "reason": notification.reason,
        "sent_by": admin["id"],
        "read_by": [],
        "created_at": datetime.utcnow()
    }
    
    await db.notifications.insert_one(notification_doc)
    
    # Log admin action
    await log_admin_action(
        admin_id=admin["id"],
        action_type="notification_sent",
        target_user_id=notification.user_id,
        details={
            "type": notification.type,
            "title": notification.title,
            "reason": notification.reason
        }
    )
    
    return {"message": "Notification sent successfully", "id": notification_id}

@api_router.post("/admin/reward")
async def assign_reward(token: str, admin_code: str, reward: RewardCreate):
    """Assign reward to user - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    if reward.amount not in [100000, 200000, 500000]:
        raise HTTPException(status_code=400, detail="Invalid reward amount")
    
    admin = await get_current_user(token)
    
    user = await db.users.find_one({"id": reward.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    reward_doc = {
        "id": str(uuid.uuid4()),
        "amount": reward.amount,
        "reason": reward.reason,
        "assigned_by": admin["id"],
        "assigned_at": datetime.utcnow().isoformat()
    }
    
    await db.users.update_one(
        {"id": reward.user_id},
        {"$push": {"rewards": reward_doc}}
    )
    
    # Send reward notification
    notification_doc = {
        "id": str(uuid.uuid4()),
        "user_id": reward.user_id,
        "type": "reward",
        "title": "Tabriklaymiz! Mukofot oldingiz!",
        "message": f"Sizga {reward.amount:,} UZS mukofot berildi. Sabab: {reward.reason}",
        "reason": reward.reason,
        "sent_by": admin["id"],
        "read_by": [],
        "created_at": datetime.utcnow()
    }
    await db.notifications.insert_one(notification_doc)
    
    # Log admin action
    await log_admin_action(
        admin_id=admin["id"],
        action_type="reward_assigned",
        target_user_id=reward.user_id,
        details={
            "amount": reward.amount,
            "reason": reward.reason
        }
    )
    
    return {"message": f"Reward of {reward.amount} UZS assigned successfully"}

@api_router.post("/admin/restrict")
async def restrict_user(token: str, admin_code: str, restriction: UserRestriction):
    """Apply restriction to user - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    admin = await get_current_user(token)
    
    user = await db.users.find_one({"id": restriction.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    restriction_doc = {
        "id": str(uuid.uuid4()),
        "type": restriction.restriction_type,
        "reason": restriction.reason,
        "active": True,
        "applied_by": admin["id"],
        "applied_at": datetime.utcnow().isoformat(),
        "duration_hours": restriction.duration_hours
    }
    
    # Remove existing restriction of same type
    await db.users.update_one(
        {"id": restriction.user_id},
        {"$pull": {"restrictions": {"type": restriction.restriction_type}}}
    )
    
    # Add new restriction
    await db.users.update_one(
        {"id": restriction.user_id},
        {"$push": {"restrictions": restriction_doc}}
    )
    
    # Send warning notification
    type_messages = {
        "run_blocked": "Yugurish boshlash",
        "map_hidden": "Xaritada ko'rinish",
        "suspended": "Hisobingiz"
    }
    
    notification_doc = {
        "id": str(uuid.uuid4()),
        "user_id": restriction.user_id,
        "type": "warning",
        "title": "Ogohlantirish: Cheklov qo'yildi",
        "message": f"{type_messages.get(restriction.restriction_type, 'Funksiya')} cheklandi. Sabab: {restriction.reason}",
        "reason": restriction.reason,
        "sent_by": admin["id"],
        "read_by": [],
        "created_at": datetime.utcnow()
    }
    await db.notifications.insert_one(notification_doc)
    
    # Log admin action
    await log_admin_action(
        admin_id=admin["id"],
        action_type="restriction_applied",
        target_user_id=restriction.user_id,
        details={
            "restriction_type": restriction.restriction_type,
            "reason": restriction.reason,
            "duration_hours": restriction.duration_hours
        }
    )
    
    return {"message": "Restriction applied successfully"}

@api_router.post("/admin/unrestrict")
async def remove_restriction(token: str, admin_code: str, data: RemoveRestriction):
    """Remove restriction from user - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    admin = await get_current_user(token)
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$pull": {"restrictions": {"type": data.restriction_type}}}
    )
    
    # Log admin action
    await log_admin_action(
        admin_id=admin["id"],
        action_type="restriction_removed",
        target_user_id=data.user_id,
        details={"restriction_type": data.restriction_type}
    )
    
    return {"message": "Restriction removed successfully"}

@api_router.get("/admin/logs")
async def get_admin_logs(token: str, admin_code: str, limit: int = 100):
    """Get admin action logs - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    logs = await db.admin_logs.find().sort("timestamp", -1).to_list(limit)
    
    return [{
        "id": log["id"],
        "admin_id": log["admin_id"],
        "action_type": log["action_type"],
        "target_user_id": log.get("target_user_id"),
        "details": log.get("details", {}),
        "timestamp": log["timestamp"].isoformat()
    } for log in logs]

@api_router.get("/admin/stats")
async def get_admin_stats(token: str, admin_code: str):
    """Get dashboard statistics - Admin only"""
    if admin_code != ADMIN_SECRET_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    
    total_users = await db.users.count_documents({})
    total_runs = await db.runs.count_documents({})
    total_notifications = await db.notifications.count_documents({})
    
    # Get total distance
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_distance"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_distance = result[0]["total"] if result else 0
    
    # Users with restrictions
    restricted_users = await db.users.count_documents({"restrictions.active": True})
    
    # Total rewards given
    pipeline = [{"$unwind": "$rewards"}, {"$group": {"_id": None, "total": {"$sum": "$rewards.amount"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_rewards = result[0]["total"] if result else 0
    
    return {
        "total_users": total_users,
        "total_runs": total_runs,
        "total_distance_km": round(total_distance, 2),
        "total_notifications": total_notifications,
        "restricted_users": restricted_users,
        "total_rewards_uzs": total_rewards
    }

# ==================== STARTUP ====================

@app.on_event("startup")
async def create_admin_user():
    admin = await db.users.find_one({"is_admin": True})
    if not admin:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "phone": "+998901234567",
            "name": "Admin",
            "password": hash_password("admin123"),
            "avatar": None,
            "total_distance": 0.0,
            "is_admin": True,
            "restrictions": [],
            "rewards": [],
            "created_at": datetime.utcnow()
        }
        await db.users.insert_one(admin_doc)
        logging.info("Default admin created: +998901234567 / admin123")

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
