from fastapi import FastAPI, HTTPException
import asyncio
import time  # Для симуляции медленной операции

app = FastAPI()

connection_pool = None


@app.get("/")
async def read_root():
    return {"Hello": "World"}


@app.get("/slow_endpoint")
async def slow_endpoint():
    # Имитация тяжелой CPU-задачи или сложного вычисления
    time.sleep(0.1)  # time.sleep блокирует весь event loop.
    return {"message": "This was a slow request"}


def cpu_intensive_task():
    total = 0
    for i in range(10_000_000):
        total += i
    return total


@app.get("/high_cpu_endpoint")
async def high_cpu_endpoint():
    result = cpu_intensive_task()
    return {"message": f"CPU task completed with result: {result}"}


@app.get("/slow_endpoint_fixed")
async def slow_endpoint_fixed():
    await asyncio.sleep(0.1)
    return {"message": "This was a asyncio sleep and now the request is no longer slow"}


@app.get("/high_cpu_endpoint_fixed")
async def high_cpu_endpoint_fixed():
    result = await asyncio.to_thread(cpu_intensive_task)
    return {
        "message": (
            f"CPU task completed with result: {result} "
            "without blocking the event loop!"
        )
    }
