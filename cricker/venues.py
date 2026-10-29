"""Canonical grounds and host countries for Cricsheet venue strings.

Cricsheet spells the same ground several ways ("Brisbane Cricket Ground",
"Brisbane Cricket Ground, Woolloongabba, Brisbane") and grounds get renamed
(Feroz Shah Kotla became Arun Jaitley Stadium). A venue id is the ground's
current name, lowercased and slugged, so every spelling of one ground shares
it. Cricsheet has no country field, so the host country comes from this table.
"""

import re

# Current ground name -> host country. West Indies grounds are listed under
# "West Indies" because that's the host for cricket purposes.
GROUNDS = {
    "Adelaide Oval": "Australia",
    "Bellerive Oval": "Australia",
    "Brisbane Cricket Ground": "Australia",
    "Great Barrier Reef Arena": "Australia",
    "Manuka Oval": "Australia",
    "Marrara Cricket Ground": "Australia",
    "Melbourne Cricket Ground": "Australia",
    "Perth Stadium": "Australia",
    "Sydney Cricket Ground": "Australia",
    "WACA Ground": "Australia",
    "Bangabandhu National Stadium": "Bangladesh",
    "Khan Shaheb Osman Ali Stadium": "Bangladesh",
    "MA Aziz Stadium": "Bangladesh",
    "Shaheed Chandu Stadium": "Bangladesh",
    "Sheikh Abu Naser Stadium": "Bangladesh",
    "Shere Bangla National Stadium": "Bangladesh",
    "Sylhet International Cricket Stadium": "Bangladesh",
    "Zahur Ahmed Chowdhury Stadium": "Bangladesh",
    "Edgbaston": "England",
    "Headingley": "England",
    "Kennington Oval": "England",
    "Lord's": "England",
    "Old Trafford": "England",
    "Riverside Ground": "England",
    "Sophia Gardens": "England",
    "The Rose Bowl": "England",
    "Trent Bridge": "England",
    "Arun Jaitley Stadium": "India",
    "Barsapara Cricket Stadium": "India",
    "Brabourne Stadium": "India",
    "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium": "India",
    "Eden Gardens": "India",
    "Green Park": "India",
    "Himachal Pradesh Cricket Association Stadium": "India",
    "Holkar Cricket Stadium": "India",
    "JSCA International Stadium Complex": "India",
    "M Chinnaswamy Stadium": "India",
    "MA Chidambaram Stadium": "India",
    "Maharashtra Cricket Association Stadium": "India",
    "Narendra Modi Stadium": "India",
    "Punjab Cricket Association IS Bindra Stadium": "India",
    "Rajiv Gandhi International Stadium": "India",
    "Saurashtra Cricket Association Stadium": "India",
    "Vidarbha C.A. Ground": "India",
    "Vidarbha Cricket Association Stadium": "India",
    "Wankhede Stadium": "India",
    "Civil Service Cricket Club": "Ireland",
    "The Village, Malahide": "Ireland",
    "AMI Stadium": "New Zealand",
    "Basin Reserve": "New Zealand",
    "Bay Oval": "New Zealand",
    "Eden Park": "New Zealand",
    "Hagley Oval": "New Zealand",
    "McLean Park": "New Zealand",
    "Seddon Park": "New Zealand",
    "University Oval": "New Zealand",
    "Gaddafi Stadium": "Pakistan",
    "Iqbal Stadium": "Pakistan",
    "Multan Cricket Stadium": "Pakistan",
    "National Stadium": "Pakistan",
    "Rawalpindi Cricket Stadium": "Pakistan",
    "Kingsmead": "South Africa",
    "Mangaung Oval": "South Africa",
    "Newlands": "South Africa",
    "Senwes Park": "South Africa",
    "St George's Park": "South Africa",
    "SuperSport Park": "South Africa",
    "The Wanderers Stadium": "South Africa",
    "Asgiriya Stadium": "Sri Lanka",
    "Galle International Stadium": "Sri Lanka",
    "P Sara Oval": "Sri Lanka",
    "Pallekele International Cricket Stadium": "Sri Lanka",
    "R Premadasa Stadium": "Sri Lanka",
    "Sinhalese Sports Club Ground": "Sri Lanka",
    "Dubai International Cricket Stadium": "United Arab Emirates",
    "Sharjah Cricket Stadium": "United Arab Emirates",
    "Sheikh Zayed Stadium": "United Arab Emirates",
    "Antigua Recreation Ground": "West Indies",
    "Arnos Vale Ground": "West Indies",
    "Brian Lara Stadium": "West Indies",
    "Daren Sammy National Cricket Stadium": "West Indies",
    "Kensington Oval": "West Indies",
    "National Cricket Stadium": "West Indies",
    "Providence Stadium": "West Indies",
    "Queen's Park Oval": "West Indies",
    "Sabina Park": "West Indies",
    "Sir Vivian Richards Stadium": "West Indies",
    "Warner Park": "West Indies",
    "Windsor Park": "West Indies",
    "Harare Sports Club": "Zimbabwe",
    "Queens Sports Club": "Zimbabwe",
}

# Former names and alternate spellings -> current name.
ALIASES = {
    "Feroz Shah Kotla": "Arun Jaitley Stadium",
    "Sardar Patel Stadium": "Narendra Modi Stadium",
    "Punjab Cricket Association Stadium": "Punjab Cricket Association IS Bindra Stadium",
    "M.Chinnaswamy Stadium": "M Chinnaswamy Stadium",
    "R.Premadasa Stadium": "R Premadasa Stadium",
    "P Saravanamuttu Stadium": "P Sara Oval",
    "Darren Sammy National Cricket Stadium": "Daren Sammy National Cricket Stadium",
    "Beausejour Stadium": "Daren Sammy National Cricket Stadium",
    "W.A.C.A. Ground": "WACA Ground",
    "Western Australia Cricket Association Ground": "WACA Ground",
    "Marrara Stadium": "Marrara Cricket Ground",
    "New Wanderers Stadium": "The Wanderers Stadium",
    "OUTsurance Oval": "Mangaung Oval",
    "Chittagong Divisional Stadium": "Zahur Ahmed Chowdhury Stadium",
    "Zohur Ahmed Chowdhury Stadium": "Zahur Ahmed Chowdhury Stadium",
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def canonical(venue):
    """Return (venue_id, name, country) for a Cricsheet venue string.

    Unknown grounds keep their own name and get no country rather than a
    guessed one.
    """
    if not venue:
        return None, None, None
    # "The Village, Malahide" is the one ground whose name has a comma in it.
    name = venue if venue.startswith("The Village") else venue.split(",")[0].strip()
    name = ALIASES.get(name, name)
    return slug(name), name, GROUNDS.get(name)
