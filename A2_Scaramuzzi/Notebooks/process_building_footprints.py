"""Build a building-roof layer classified by economic-zone overlap and greenspace distance.

The script downloads Montreal's building outlines, keeps roofs that substantially
overlap economic activity zones, measures their distance to greenspace, and writes
the result as a GeoJSON file in the same projected coordinate system.

Run this file from any directory with Python and the required packages installed.
"""

import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import shapefile
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


# ---------------------------------------------------------------------------
# Settings: the source data, coordinate system, and output location
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
BUILDING_DATA_URL = (
    "https://donnees.montreal.ca/dataset/"
    "fab160ae-c81d-46f8-8f92-4a01c10d4390/resource/"
    "183866d5-9027-456a-b0af-36b2e45c8aac/download/"
    "batiments_2d_2016_arrondissements.zip"
)
BUILDING_LAYER = "CARTO-BAT-TOIT"
EXPECTED_CRS = "urn:ogc:def:crs:EPSG::32188"
MINIMUM_ZONE_OVERLAP = 0.5
GREENSPACE_DISTANCE_METRES = 500
OUTPUT_PATH = ROOT / "Data/buildings/building_footprints_in_economic_zones.geojson"


# ---------------------------------------------------------------------------
# Read and prepare the source building dataset
# ---------------------------------------------------------------------------
def load_geojson(path):
    """Read a GeoJSON file and return its contents as a Python dictionary."""
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def download_source(destination):
    """Download the Montreal building archive to a temporary file."""
    subprocess.run(
        [
            "curl",
            "--fail",
            "--location",
            "--retry",
            "2",
            "--user-agent",
            "Mozilla/5.0 (compatible; MontrealBuildingFootprintStudy/1.0)",
            "--referer",
            "https://donnees.montreal.ca/dataset/batiment-2d",
            "--output",
            str(destination),
            BUILDING_DATA_URL,
        ],
        check=True,
    )


def extract_roof_layer(archive_path, destination):
    """Extract the shapefile pieces needed to read the roof outlines."""
    with zipfile.ZipFile(archive_path) as archive:
        for extension in (".shp", ".shx", ".dbf", ".prj"):
            member_name = BUILDING_LAYER + extension
            try:
                member = archive.getinfo(member_name)
            except KeyError as error:
                raise ValueError(f"Building dataset is missing {member_name}.") from error
            with archive.open(member) as source, (destination / member_name).open("wb") as target:
                shutil.copyfileobj(source, target)


# ---------------------------------------------------------------------------
# Select the roofs and measure their relationship to the study areas
# ---------------------------------------------------------------------------
def main():
    # Load both study layers and ensure their coordinates are in metres.
    economic_data = load_geojson(ROOT / "Data/intens_affect/economic_activities.geojson")
    greenspace_data = load_geojson(ROOT / "Data/affect_espacevertlocal/affect_espacevertlocal.json")
    for label, dataset in (("Economic zones", economic_data), ("Greenspaces", greenspace_data)):
        crs_name = dataset.get("crs", {}).get("properties", {}).get("name")
        if crs_name != EXPECTED_CRS:
            raise ValueError(f"{label} must use EPSG:32188; found {crs_name!r}.")

    # Combine each set of polygons so each roof can be checked against one shape.
    economic_zones = unary_union(
        [shape(feature["geometry"]) for feature in economic_data["features"]]
    )
    greenspaces = unary_union(
        [shape(feature["geometry"]) for feature in greenspace_data["features"]]
    )

    # Keep downloaded and extracted source files temporary; only the final
    # GeoJSON is written into the project.
    with tempfile.TemporaryDirectory(prefix="montreal-buildings-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        archive_path = temporary_path / "building_footprints.zip"
        download_source(archive_path)
        extract_roof_layer(archive_path, temporary_path)

        # Check the shapefile's projection definition before measuring areas
        # and distances, which are only meaningful here when units are metres.
        projection = (temporary_path / f"{BUILDING_LAYER}.prj").read_text(encoding="utf-8")
        if not re.search(r'Central_Meridian",\s*-73\.5', projection, re.IGNORECASE):
            raise ValueError("Building dataset projection is not Montréal MTM zone 8.")
        if not re.search(r'False_Easting",\s*304800', projection, re.IGNORECASE):
            raise ValueError("Building dataset projection does not match EPSG:32188.")

        reader = shapefile.Reader(
            str(temporary_path / BUILDING_LAYER),
            encoding="latin1",
        )
        features = []
        within_distance_count = 0

        # Keep valid roofs that overlap at least half their area with an
        # economic zone, then record their distance to the nearest greenspace.
        for source_id, shape_record in enumerate(reader.iterShapeRecords()):
            roof = shape(shape_record.shape.__geo_interface__)
            if roof.is_empty or roof.area <= 0 or not roof.intersects(economic_zones):
                continue

            overlap_ratio = roof.intersection(economic_zones).area / roof.area
            if overlap_ratio < MINIMUM_ZONE_OVERLAP:
                continue

            distance = roof.distance(greenspaces)
            within_500m = distance <= GREENSPACE_DISTANCE_METRES
            features.append(
                {
                    "type": "Feature",
                    "id": source_id,
                    "properties": {
                        "source_id": source_id,
                        "roof_area_m2": round(roof.area, 1),
                        "economic_zone_overlap_percent": round(overlap_ratio * 100, 1),
                        "greenspace_distance_m": round(distance, 1),
                        "within_500m": within_500m,
                    },
                    "geometry": mapping(roof),
                }
            )
            within_distance_count += within_500m

    # Save the selected roofs and measurements as a GeoJSON FeatureCollection.
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    output_data = {
        "type": "FeatureCollection",
        "name": "building_roof_footprints_in_economic_zones",
        "crs": {"type": "name", "properties": {"name": EXPECTED_CRS}},
        "features": features,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as output:
        json.dump(output_data, output, separators=(",", ":"))

    # Report the output counts so the result can be checked after each run.
    print(f"Building roof outlines in economic zones: {len(features)}")
    print(f"Within 500 m of greenspace: {within_distance_count}")
    print(f"Over 500 m from greenspace: {len(features) - within_distance_count}")
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
