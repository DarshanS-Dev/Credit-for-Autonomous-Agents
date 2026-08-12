from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str

    # JWT / credential signing
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # Agent API-key hashing (HMAC pepper, distinct purpose from jwt_secret_key
    # but defaulted to it so no new required .env var today -- see TODO in
    # credential_service.py about splitting this into its own secret later)
    agent_api_key_pepper: str = ""

    # App
    environment: str = "development"
    debug: bool = True

    def model_post_init(self, __context) -> None:
        if not self.agent_api_key_pepper:
            self.agent_api_key_pepper = self.jwt_secret_key


settings = Settings()