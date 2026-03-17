import os
import aiohttp
from typing import Optional


class ProcoreClient:
    """Procore REST API v1.0 client with OAuth2 token refresh."""

    def __init__(self):
        self.client_id = os.environ.get("PROCORE_CLIENT_ID", "")
        self.client_secret = os.environ.get("PROCORE_CLIENT_SECRET", "")
        self.access_token = os.environ.get("PROCORE_ACCESS_TOKEN", "")
        self.refresh_token = os.environ.get("PROCORE_REFRESH_TOKEN", "")
        self.company_id = os.environ.get("PROCORE_COMPANY_ID", "")
        # Use sandbox URLs if PROCORE_SANDBOX=1, otherwise production
        use_sandbox = os.environ.get("PROCORE_SANDBOX", "1") == "1"
        if use_sandbox:
            self.BASE_URL = "https://sandbox.procore.com/rest/v1.0"
            self.AUTH_URL = "https://sandbox.procore.com/oauth/token"
        else:
            self.BASE_URL = "https://app.procore.com/rest/v1.0"
            self.AUTH_URL = "https://login.procore.com/oauth/token"

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.access_token)

    async def _refresh_access_token(self, session: aiohttp.ClientSession) -> bool:
        """Attempt to refresh the OAuth2 access token."""
        if not self.refresh_token or not self.client_id:
            return False
        payload = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
        }
        try:
            async with session.post(self.AUTH_URL, json=payload) as resp:
                if resp.status != 200:
                    print(f"  Procore token refresh failed: {resp.status}")
                    return False
                data = await resp.json()
                self.access_token = data["access_token"]
                self.refresh_token = data.get("refresh_token", self.refresh_token)
                return True
        except Exception as e:
            print(f"  Procore token refresh error: {e}")
            return False

    async def _request(
        self, session: aiohttp.ClientSession, method: str, path: str, params: Optional[dict] = None
    ) -> Optional[list | dict]:
        """Make an authenticated request, refreshing token on 401."""
        url = f"{self.BASE_URL}{path}"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        async with session.request(method, url, headers=headers, params=params) as resp:
            if resp.status == 401:
                # Try refresh
                if await self._refresh_access_token(session):
                    headers["Authorization"] = f"Bearer {self.access_token}"
                    async with session.request(method, url, headers=headers, params=params) as retry:
                        if retry.status == 200:
                            return await retry.json()
                        return None
                return None
            if resp.status != 200:
                print(f"  Procore API {resp.status}: {path}")
                return None
            return await resp.json()

    async def get_projects(self) -> list[dict]:
        """Fetch projects from Procore API."""
        all_projects = []
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            page = 1
            while True:
                params = {"company_id": self.company_id, "per_page": 100, "page": page}
                data = await self._request(session, "GET", "/projects", params=params)
                if not data or not isinstance(data, list):
                    break
                all_projects.extend(data)
                if len(data) < 100:
                    break
                page += 1
        return all_projects

    async def get_project_users(self, project_id: int) -> list[dict]:
        """Fetch users assigned to a Procore project (paginated)."""
        all_users = []
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            page = 1
            while True:
                params = {"company_id": self.company_id, "per_page": 100, "page": page}
                data = await self._request(session, "GET", f"/projects/{project_id}/users", params=params)
                if not data or not isinstance(data, list):
                    break
                all_users.extend(data)
                if len(data) < 100:
                    break
                page += 1
        return all_users

    async def get_rfis(self, project_id: int) -> list[dict]:
        """Fetch RFIs for a Procore project (paginated)."""
        all_rfis = []
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            page = 1
            while True:
                params = {"company_id": self.company_id, "per_page": 100, "page": page}
                data = await self._request(session, "GET", f"/projects/{project_id}/rfis", params=params)
                if not data or not isinstance(data, list):
                    break
                all_rfis.extend(data)
                if len(data) < 100:
                    break
                page += 1
        return all_rfis
