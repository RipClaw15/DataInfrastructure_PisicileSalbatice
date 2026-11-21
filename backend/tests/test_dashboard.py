def test_dashboard_page_and_assets(client):
    response = client.get("/dashboard")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="device-select"' in response.text
    assert 'id="motion-chart"' in response.text
    assert 'id="alert-list"' in response.text
    assert 'id="readings-body"' in response.text
    assert "/static/guard-dashboard.js" in response.text
    assert "/static/guard-dashboard.css" in response.text
    for path in ("/static/guard-dashboard.js", "/static/guard-dashboard.css"):
        asset = client.get(path)
        assert asset.status_code == 200
        assert len(asset.content) > 0


def test_landing_page_links_to_live_dashboard(client):
    response = client.get("/")
    assert response.status_code == 200
    assert 'href="/dashboard"' in response.text
