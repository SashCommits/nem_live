"""ERCOT-specific config: which fuel-mix columns map to which shared fuel,
and which settlement points are published as "regions" (mirroring how
poller.py's REGIONS maps NEM states to DUID region codes).
"""

# gridstatus's Ercot().get_fuel_mix() column -> fueltech.FUELS key.
# "Power Storage" isn't listed here: it's a single signed column (positive
# discharging, negative charging) split at collection time into
# "Battery (discharging)"/"Battery (charging)", the same two buckets NEM's
# per-DUID battery MW is split into.
FUEL_MIX_COLUMNS = {
    "Coal and Lignite": "Coal",
    "Hydro": "Hydro",
    "Nuclear": "Nuclear",
    "Solar": "Solar (utility)",
    "Wind": "Wind",
    "Natural Gas": "Gas",
    "Other": "Other",
}

# ERCOT has no single system-wide price like NEM's RRP: price is locational
# (LMP) per settlement point. HB_HUBAVG is ERCOT's own published average
# across the major trading hubs and stands in for NEM's "nem" aggregate;
# the rest are the major hubs themselves, standing in for NEM's states.
# Demand, supply and fuel mix are system-wide in every ERCOT report gridstatus
# exposes (there's no per-hub load or generation breakdown), so every region
# below shares the same demand/supply/fuel-mix series and differs only in
# which settlement point its price comes from.
REGIONS = {
    "ercot": "HB_HUBAVG",
    "houston": "HB_HOUSTON",
    "north": "HB_NORTH",
    "south": "HB_SOUTH",
    "west": "HB_WEST",
    "pan": "HB_PAN",
}
