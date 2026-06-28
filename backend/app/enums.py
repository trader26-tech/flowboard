import enum


class Role(str, enum.Enum):
    admin = "admin"
    client = "client"


class TaskStatus(str, enum.Enum):
    requested = "requested"      # submitted by client, sitting in the backlog
    scheduled = "scheduled"      # placed onto a day timeline by the admin
    in_progress = "in_progress"  # timer running / actively being worked on
    completed = "completed"      # finished, with proof image
    cancelled = "cancelled"      # dropped
