from app.api import dashboard as dashboard_api


def test_summary_cache_hit_within_ttl(monkeypatch):
    dashboard_api._SUMMARY_CACHE.clear()
    timeline = iter([100.0, 110.0])
    monkeypatch.setattr(dashboard_api, "_cache_now", lambda: next(timeline))

    payload = {"cached": True}
    dashboard_api._set_summary_cache("Q2", 2026, payload)

    assert dashboard_api._get_summary_cache("Q2", 2026) == payload


def test_summary_cache_expires_after_ttl(monkeypatch):
    dashboard_api._SUMMARY_CACHE.clear()
    timeline = iter([200.0, 232.0])
    monkeypatch.setattr(dashboard_api, "_cache_now", lambda: next(timeline))

    payload = {"cached": True}
    dashboard_api._set_summary_cache("Q3", 2026, payload)

    assert dashboard_api._get_summary_cache("Q3", 2026) is None
    assert ("Q3", 2026) not in dashboard_api._SUMMARY_CACHE
