import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from packages.db.session import async_session
from packages.db.models import Team, User
from sqlalchemy import select

async def seed():
    async with async_session() as db:
        team_check = await db.execute(select(Team).where(Team.name == 'Northeast Commercial'))
        if not team_check.scalars().first():
            new_team = Team(name='Northeast Commercial')
            db.add(new_team)
            await db.flush()

            manager = User(name='Sarah Manager', email='sarah@smoke.io', role='manager', team_id=new_team.id)
            rep1 = User(name='John Rep', email='john@smoke.io', role='rep', team_id=new_team.id)
            rep2 = User(name='Construction Rep', email='rep@smoke.io', role='rep', team_id=new_team.id)
            
            db.add_all([manager, rep1, rep2])
            await db.commit()
            print("Seeded Team and Users.")
        else:
            print("Already seeded.")

if __name__ == "__main__":
    asyncio.run(seed())
