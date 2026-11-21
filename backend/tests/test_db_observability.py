import json
import logging

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, TimeoutError

from backend.app.observability import TimedQueuePool, instrument_queries, request_id


def records(caplog):
    return [json.loads(row.message) for row in caplog.records if row.message.startswith('{')]


def test_pool_exhaustion_fails_within_configured_bound(caplog):
    engine = create_engine('sqlite://', poolclass=TimedQueuePool,
                           pool_size=1, max_overflow=0, pool_timeout=0.03)
    caplog.set_level(logging.INFO, logger='uvicorn.error')
    try:
        with engine.connect():
            with pytest.raises(TimeoutError):
                engine.connect()
        failed = [r for r in records(caplog) if r.get('error') == 'TimeoutError']
        assert len(failed) == 1
        assert 20 <= failed[0]['elapsed_ms'] < 1000
    finally:
        engine.dispose()


def test_query_timings_correlate_and_never_include_sql_or_parameters(caplog):
    engine = create_engine('sqlite://', poolclass=TimedQueuePool)
    instrument_queries(engine)
    caplog.set_level(logging.INFO, logger='uvicorn.error')
    token = request_id.set('test-request')
    try:
        with engine.connect() as conn:
            assert conn.scalar(text('SELECT :secret'), {'secret': 'private-value'}) == 'private-value'
            with pytest.raises(OperationalError):
                conn.execute(text('SELECT * FROM private_missing_table'))
        rows = records(caplog)
        assert all(row['request_id'] == 'test-request' for row in rows)
        assert {'db_checkout', 'db_query', 'db_error'} <= {r['event'] for r in rows}
        assert 'private-value' not in caplog.text
        assert 'private_missing_table' not in caplog.text
    finally:
        request_id.reset(token)
        engine.dispose()


def test_request_ids_match_response_and_logs(client, caplog):
    caplog.set_level(logging.INFO, logger='uvicorn.error')
    first = client.get('/health', headers={'X-Request-ID': 'untrusted-input'})
    second = client.get('/health')
    assert first.status_code == second.status_code == 200
    assert first.headers['x-request-id'] != second.headers['x-request-id']
    assert first.headers['server-timing'].startswith('app;dur=')
    rows = records(caplog)
    assert len([r for r in rows if r['event'] == 'request_end']) == 2
    assert first.headers['x-request-id'] in {r['request_id'] for r in rows}
    assert 'untrusted-input' not in caplog.text
