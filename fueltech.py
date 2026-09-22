"""Fuel-tech mapping shared by the live poller (same rules as the Streamlit app)."""

# Stack order, bottom to top. Negative fuels are drawn below zero.
#
# "Coal", "Nuclear" and "Other" exist for markets (e.g. US ISOs) that don't
# report the finer NEM splits: NEM never emits them, so adding them here
# doesn't change anything for the existing NEM consumers of this table.
FUELS = {
    "Coal (brown)": "#7A4E2D",
    "Coal (black)": "#2B2F33",
    "Coal": "#4A3728",
    "Nuclear": "#7B2D8E",
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
    "Other": "#6B7280",
}
NEGATIVE = {"Battery (charging)", "Pumps"}
RENEWABLE = {"Bioenergy", "Hydro", "Wind", "Solar (utility)", "Solar (rooftop)"}
STORAGE = {"Battery (discharging)", "Battery (charging)", "Pumps"}

# CO2E_ENERGY_SOURCE values from the MMSDM GENUNITS table. It is a closed
# vocabulary, so map it explicitly: keyword matching gets several of these
# wrong, putting "Landfill biogas methane" in Gas and "Coal mine waste gas"
# in coal.
ENERGY_SOURCE = {
    "black coal": "Coal (black)",
    "brown coal": "Coal (brown)",
    "other solid fossil fuels": "Coal (black)",
    "natural gas (pipeline)": "Gas",
    "coal seam methane": "Gas",
    "coal mine waste gas": "Gas",
    "ethane": "Gas",
    "hydro": "Hydro",
    "wind": "Wind",
    "solar": "Solar (utility)",
    "battery storage": "Battery",
    "diesel oil": "Distillate",
    "kerosene - non aviation": "Distillate",
    "landfill biogas methane": "Bioenergy",
    "bagasse": "Bioenergy",
    "biomass and industrial materials": "Bioenergy",
    "other biofuels": "Bioenergy",
    "primary solid biomass fuels": "Bioenergy",
}


def classify(source: str, is_load: bool) -> str | None:
    """Map a GENUNITS energy source to a fuel-tech bucket."""
    fuel = ENERGY_SOURCE.get(str(source).strip().lower())
    if fuel is None:
        return None
    if fuel == "Battery":
        return "Battery"  # split into charging/discharging from the live MW
    if is_load:
        return "Pumps" if fuel == "Hydro" else None
    return fuel
