from fastapi import APIRouter, Depends, HTTPException, status

from .. import db
from ..deps import require_admin
from ..enums import Role
from ..schemas import ClientCreate, ClientUpdate, UserOut
from ..security import hash_password

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[UserOut])
async def list_clients(_: dict = Depends(require_admin)):
    return await db.list_clients()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_client(payload: ClientCreate, _: dict = Depends(require_admin)):
    email = payload.email.lower()
    if await db.get_user_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    return await db.create_user(
        {
            "email": email,
            "name": payload.name,
            "password_hash": hash_password(payload.password),
            "role": Role.client.value,
            "color": payload.color,
        }
    )


@router.patch("/{client_id}", response_model=UserOut)
async def update_client(
    client_id: str, payload: ClientUpdate, _: dict = Depends(require_admin)
):
    client = await db.get_user(client_id)
    if client is None or client["role"] != Role.client.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    fields: dict = {}
    if payload.name is not None:
        fields["name"] = payload.name
    if payload.color is not None:
        fields["color"] = payload.color
    if payload.is_active is not None:
        fields["is_active"] = payload.is_active
    if payload.password is not None:
        fields["password_hash"] = hash_password(payload.password)

    if not fields:
        return client
    return await db.update_user(client_id, fields)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(client_id: str, _: dict = Depends(require_admin)):
    client = await db.get_user(client_id)
    if client is None or client["role"] != Role.client.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    await db.delete_user(client_id)
