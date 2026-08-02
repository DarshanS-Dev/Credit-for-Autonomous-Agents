"""main.py — FastAPI app entrypoint, wires all routers together."""

from fastapi import FastAPI

from app.routers import auth, agents, loans, repayment, lenders, admin

app = FastAPI(title="Credit for Autonomous Agents")

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(loans.router)
app.include_router(repayment.router)
app.include_router(lenders.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return {"status": "ok"}