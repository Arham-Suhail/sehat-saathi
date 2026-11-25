import pytest

from app.config import ConfigError
from tests.conftest import TEST_SECRET, make_settings


def test_valid_test_settings():
    s = make_settings()
    assert s.resolved_text_provider == "fake"


@pytest.mark.parametrize("secret", ["", "short", "changeme", "<generate-a-long-random-secret>"])
def test_weak_or_missing_jwt_secret_fails(secret):
    with pytest.raises(ConfigError) as e:
        make_settings(jwt_secret=secret)
    assert secret == "" or secret not in str(e.value)  # never echo the secret


def test_missing_mongo_uri_fails_outside_test():
    with pytest.raises(ConfigError, match="MONGODB_URI"):
        make_settings(env="dev", mongodb_uri="")


def test_wildcard_origin_rejected():
    with pytest.raises(ConfigError, match="ALLOWED_ORIGINS"):
        make_settings(allowed_origins="*")


def test_real_provider_requires_key_url_model():
    with pytest.raises(ConfigError, match="TEXT_API_KEY"):
        make_settings(provider="gemini", vision_base_url="u", vision_api_key="k", vision_model="m")


def test_fake_provider_rejected_in_prod():
    with pytest.raises(ConfigError, match="fake"):
        make_settings(env="prod", mongodb_uri="mongodb://x")


def test_secret_value_not_in_error_message():
    leaked = "x" * 10
    with pytest.raises(ConfigError) as e:
        make_settings(jwt_secret=leaked)
    assert leaked not in str(e.value)
    assert TEST_SECRET not in str(e.value)
