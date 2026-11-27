"""Code guard over LLM-suggested alternatives (Disprin is aspirin, never a paracetamol option)."""

import pytest

from app.services.alternatives_guard import generic_salts, is_safe_alternative


@pytest.mark.parametrize(
    "product",
    ["Disprin 300mg", "Loprin 75mg", "Brufen 400mg", "Ponstan 500mg", "Panadol Extra", "Panadol CF 500mg",
     "Calpol 250mg", "Panadol 1g"],
)
def test_wrong_salt_combo_or_strength_is_dropped(product):
    assert not is_safe_alternative(product, "Paracetamol", "Panadol", "500mg")


@pytest.mark.parametrize("product", ["Calpol 500mg", "Febrol", "Tylenol 500 mg", "UnknownBrand 500mg"])
def test_same_salt_same_strength_is_kept(product):
    assert is_safe_alternative(product, "Paracetamol", "Panadol", "500mg")


def test_falls_back_to_current_brand_salt_when_generic_unknown():
    assert not is_safe_alternative("Disprin", "unknown", "Panadol", "")
    assert is_safe_alternative("Calpol", "unknown", "Panadol", "")


def test_aliases_and_combo_current_medicine():
    assert generic_salts("Acetaminophen") == {"paracetamol"}
    assert generic_salts("unknown") is None
    assert is_safe_alternative("Ascard 75mg", "Acetylsalicylic acid", "Loprin", "75mg")
    # The current medicine itself is an "Extra": the variant word is allowed.
    assert is_safe_alternative("Panadol Extra 500mg", "unknown", "Panadol Extra", "500mg")
    assert not is_safe_alternative("", "Paracetamol", "Panadol", "500mg")
