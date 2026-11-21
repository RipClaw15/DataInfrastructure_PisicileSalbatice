import importlib

import pytest

main = importlib.import_module("backend.app.main")


@pytest.fixture
def dashboard_build(tmp_path, monkeypatch):
    build = tmp_path / "dashboard_dist"
    assets = build / "assets"
    assets.mkdir(parents=True)
    (build / "index.html").write_text(
        '<html><div id="root"></div><script type="module" src="/dashboard/assets/app-test.js"></script></html>'
    )
    (assets / "app-test.js").write_text('console.log("React dashboard bundle")')
    (assets / "app-test.css").write_text('body { margin: 0; }')
    (tmp_path / "private.txt").write_text("must not be served")
    monkeypatch.setattr(main, "DASHBOARD_DIR", build)
    return build


@pytest.mark.parametrize("path", ["/dashboard", "/dashboard/"])
def test_dashboard_serves_react_build(client, dashboard_build, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="root"' in response.text
    assert "/dashboard/assets/app-test.js" in response.text
    assert response.headers["cache-control"] == "no-store"


def test_dashboard_assets(client, dashboard_build):
    for path in ("/dashboard/assets/app-test.js", "/dashboard/assets/app-test.css"):
        asset = client.get(path)
        assert asset.status_code == 200
        assert len(asset.content) > 0


def test_missing_build_is_reported(client, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DASHBOARD_DIR", tmp_path / "missing")
    response = client.get("/dashboard")
    assert response.status_code == 503
    assert "Dashboard build is missing" in response.json()["detail"]


def test_missing_asset_does_not_return_html(client, dashboard_build):
    assert client.get("/dashboard/assets/missing.js").status_code == 404


def test_assets_cannot_escape_build_directory(client, dashboard_build):
    response = client.get("/dashboard/assets/%2e%2e/%2e%2e/private.txt")
    assert response.status_code == 404


def test_api_routes_are_not_shadowed_by_dashboard(client, auth_headers, dashboard_build):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/me/events", headers=auth_headers).json() == {"events": []}


def test_landing_page_links_to_live_dashboard(client):
    response = client.get("/")
    assert response.status_code == 200
    assert 'href="/dashboard"' in response.text
