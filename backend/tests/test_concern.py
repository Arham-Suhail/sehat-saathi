import pytest

from app.services.concern import detect_concern


@pytest.mark.parametrize(
    "text",
    [
        "Seene mein dard hai",
        "aaj saans lene mein mushkil",
        "subah se chakkar aa rahe hain",
        "kal behosh ho gaya tha",
        "Bukhar hai thora",
        "main bathroom mein gir gayi",
        "I have chest pain",
        "feeling dizzy and faint",
        "ulti ho rahi hai",
    ],
)
def test_detects_red_flags(text):
    assert detect_concern(text), text


@pytest.mark.parametrize(
    "text",
    [
        "Main bilkul theek hoon, shukriya",
        "aaj mood acha hai, ache se soya",
        "khana acha tha aur walk ki",
        "",
        None,
    ],
)
def test_no_false_positive_on_normal_answers(text):
    assert detect_concern(text) == []


def test_labels_are_deduplicated():
    labels = detect_concern("dard dard pain")
    assert labels == ["dard / pain"]
