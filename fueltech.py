"""Fuel-tech mapping shared by the live poller (same rules as the Streamlit app)."""

# Stack order, bottom to top. Negative fuels are drawn below zero.
FUELS = {
    "Coal (brown)": "#7A4E2D",
    "Coal (black)": "#2B2F33",
    "Bioenergy": "#8F9E5A",
    "Distillate": "#B8452F",
    "Gas": "#E8872B",
    "Hydro": "#3F7CAC",
    "Wind": "#2F8A63",
    "Solar (utility)": "#F2C12E",
    "Solar (rooftop)": "#F8DE8A",
    "Battery (discharging)": "#5B4FC4",
    "Battery (charging)": "#9C94E6",
    "Pumps": "#8DB4D6",
}
NEGATIVE = {"Battery (charging)", "Pumps"}
RENEWABLE = {"Bioenergy", "Hydro", "Wind", "Solar (utility)", "Solar (rooftop)"}
STORAGE = {"Battery (discharging)", "Battery (charging)", "Pumps"}

FIELDS = [
    "Fuel Source - Primary",
    "Fuel Source - Descriptor",
    "Technology Type - Primary",
    "Technology Type - Descriptor",
]


def classify(row) -> str | None:
    """Map AEMO registration fields to a fuel-tech bucket."""
    text = " ".join(str(row.get(c, "")) for c in FIELDS).lower()
    dtype = str(row.get("Dispatch Type", "")).lower()
    is_load = "load" in dtype and "bidirectional" not in dtype

    if "battery" in text:
        return "Battery"
    if is_load:
        if "hydro" in text or "pump" in text or "water" in text:
            return "Pumps"
        return None
    if "solar" in text:
        return "Solar (utility)"
    if "wind" in text:
        return "Wind"
    if "hydro" in text or "water" in text:
        return "Hydro"
    if "methane" in text or "coal seam" in text or "mine gas" in text:
        return "Gas"
    if "brown coal" in text:
        return "Coal (brown)"
    if "coal" in text:
        return "Coal (black)"
    if "gas" in text:
        return "Gas"
    if any(k in text for k in ("diesel", "distillate", "liquid", "kerosene", "oil")):
        return "Distillate"
    if any(k in text for k in ("bio", "landfill", "bagasse", "waste", "sewage", "wood")):
        return "Bioenergy"
    return None
