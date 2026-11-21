"""Request-correlated timing without SQL, parameters, locations, or credentials."""

from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
from time import perf_counter

from sqlalchemy import event
from sqlalchemy.pool import QueuePool

request_id: ContextVar[str] = ContextVar("request_id", default="startup")
logger = logging.getLogger("uvicorn.error")


def record(event_name: str, **fields) -> None:
    slow = fields.get("elapsed_ms", 0) >= 500
    logger.log(logging.WARNING if slow or fields.get("error") else logging.INFO,
               json.dumps({"event": event_name, "request_id": request_id.get(), **fields}))


@contextmanager
def timed_stage(stage: str):
    started = perf_counter()
    record(stage + "_start")
    try:
        yield
    except Exception as exc:
        record(stage, elapsed_ms=round((perf_counter() - started) * 1000, 2),
               error=type(exc).__name__)
        raise
    else:
        record(stage, elapsed_ms=round((perf_counter() - started) * 1000, 2))


class TimedQueuePool(QueuePool):
    def connect(self):
        # Includes waiting for a slot, creating a connection, and pre-ping.
        with timed_stage("db_checkout"):
            return super().connect()


def instrument_queries(engine) -> None:
    @event.listens_for(engine, "before_cursor_execute")
    def before_query(conn, cursor, statement, parameters, context, executemany):
        context._timing_started = perf_counter()
        record("db_query_start")

    @event.listens_for(engine, "after_cursor_execute")
    def after_query(conn, cursor, statement, parameters, context, executemany):
        record("db_query", elapsed_ms=round((perf_counter() - context._timing_started) * 1000, 2))

    @event.listens_for(engine, "handle_error")
    def query_error(context):
        started = getattr(context.execution_context, "_timing_started", None)
        record("db_error", error=type(context.original_exception).__name__,
               sqlstate=getattr(context.original_exception, "sqlstate", None),
               elapsed_ms=round((perf_counter() - started) * 1000, 2) if started is not None else 0,
               disconnected=context.is_disconnect)
