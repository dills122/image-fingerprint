# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "numpy==2.2.6",
#   "opencv-python-headless==4.12.0.88",
# ]
# ///
"""Pinned AKAZE/SIFT research oracle for the internal crop-local-v0 experiment."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


MAXIMUM_DIMENSION = 768
MAXIMUM_FEATURES = 384
GRID_SIDE = 6
MAXIMUM_FEATURES_PER_CELL = 16
MINIMUM_CANDIDATE_MATCHES = 4
GEOMETRY_RESIDUAL_PERMILLE = (6, 10)
GEOMETRY_MINIMUM_INLIERS = (4, 6, 8)
GEOMETRY_MINIMUM_INLIER_RATIOS = (0.25, 0.4)
GEOMETRY_MINIMUM_ZONES = (2, 3, 4)
FINAL_MINIMUM_INFORMATIVE_COVERAGE = (0.05, 0.1, 0.2)
FINAL_MINIMUM_AGREEMENT = (0.5, 0.65, 0.8, 0.9, 0.95, 0.975)
FINAL_MAXIMUM_CONTRADICTION = (0.02, 0.1, 0.2, 0.3)
FINAL_MINIMUM_ZONES = (3, 4, 6)
LOCKED_AKAZE_PROFILE = {
    "candidate": {"maximumDistance": 48.0, "ratio": 0.7},
    "geometry": {
        "residualPermille": 6,
        "minimumInliers": 4,
        "minimumInlierRatio": 0.4,
        "minimumZones": 2,
    },
    "verification": {
        "minimumInformativeCoverage": 0.05,
        "minimumAgreement": 0.95,
        "maximumContradiction": 0.02,
        "minimumInformativeZones": 3,
    },
}

CANDIDATE_PROFILES = {
    "akaze": [
        {"maximumDistance": distance, "ratio": ratio}
        for distance in (48.0, 64.0, 80.0, 96.0)
        for ratio in (0.7, 0.8, 0.9)
    ],
    "sift": [
        {"maximumDistance": distance, "ratio": ratio}
        for distance in (150.0, 250.0, 350.0)
        for ratio in (0.7, 0.8, 0.9)
    ],
}


@dataclass(frozen=True)
class Features:
    points: np.ndarray
    sizes: np.ndarray
    responses: np.ndarray
    descriptors: np.ndarray
    repetition: np.ndarray


@dataclass(frozen=True)
class Variant:
    image: np.ndarray
    gray: np.ndarray
    local_luminance: np.ndarray
    gradient: np.ndarray
    census: np.ndarray
    features: Features
    original_offset_x: int
    original_offset_y: int
    normalization_scale_x: float
    normalization_scale_y: float


@dataclass(frozen=True)
class Pair:
    left: str
    right: str
    positive: bool
    domain: str | None
    domain_pair: str | None


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--method", choices=("akaze", "sift", "both"), default="both")
    parser.add_argument(
        "--locked-akaze-development-profile",
        action="store_true",
        help="Evaluate only the AKAZE profile selected on the 2026-08-09 development corpus",
    )
    return parser.parse_args()


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def summary(values: list[float]) -> dict[str, float | int | None]:
    return {
        "count": len(values),
        "p50": percentile(values, 0.5),
        "p95": percentile(values, 0.95),
        "maximum": max(values) if values else None,
    }


def metrics(decisions: list[dict[str, Any]]) -> dict[str, float | int | None]:
    true_positive = sum(entry["positive"] and entry["matches"] for entry in decisions)
    false_negative = sum(entry["positive"] and not entry["matches"] for entry in decisions)
    false_positive = sum(not entry["positive"] and entry["matches"] for entry in decisions)
    true_negative = sum(not entry["positive"] and not entry["matches"] for entry in decisions)
    return {
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "trueNegative": true_negative,
        "falseNegative": false_negative,
        "precision": (
            true_positive / (true_positive + false_positive)
            if true_positive + false_positive else None
        ),
        "recall": (
            true_positive / (true_positive + false_negative)
            if true_positive + false_negative else None
        ),
        "falsePositiveRate": (
            false_positive / (false_positive + true_negative)
            if false_positive + true_negative else None
        ),
    }


def domain_metrics(decisions: list[dict[str, Any]], domains: list[str]) -> dict[str, Any]:
    return {
        domain: metrics([
            entry for entry in decisions if entry["positive"] and entry["domain"] == domain
        ])
        for domain in domains
    }


def negative_domain_metrics(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    domain_pairs = sorted({
        entry["domainPair"] for entry in decisions if not entry["positive"]
    })
    return {
        domain_pair: metrics([
            entry for entry in decisions
            if not entry["positive"] and entry["domainPair"] == domain_pair
        ])
        for domain_pair in domain_pairs
    }


def read_image(path: Path) -> np.ndarray:
    encoded = np.fromfile(path, dtype=np.uint8)
    decoded = cv2.imdecode(encoded, cv2.IMREAD_UNCHANGED)
    if decoded is None:
        raise ValueError(f"OpenCV could not decode {path}")
    if decoded.ndim == 2:
        return cv2.cvtColor(decoded, cv2.COLOR_GRAY2BGR)
    if decoded.shape[2] == 3:
        return decoded
    if decoded.shape[2] != 4:
        raise ValueError(f"Unsupported channel count for {path}: {decoded.shape[2]}")
    color = decoded[:, :, :3].astype(np.uint16)
    alpha = decoded[:, :, 3:4].astype(np.uint16)
    return ((color * alpha + 255 * (255 - alpha) + 127) // 255).astype(np.uint8)


def crop(image: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
    return np.ascontiguousarray(image[y:y + height, x:x + width])


def transformed(image: np.ndarray, mode: str) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    height, width = image.shape[:2]
    if mode == "center":
        crop_width = max(40, math.floor(width * 0.7))
        crop_height = max(40, math.floor(height * 0.7))
        box = (
            math.floor((width - crop_width) / 2),
            math.floor((height - crop_height) / 2),
            crop_width,
            crop_height,
        )
        return crop(
            image,
            box[0], box[1], box[2], box[3],
        ), box
    if mode == "asymmetric":
        crop_width = max(40, math.floor(width * 0.62))
        crop_height = max(40, math.floor(height * 0.82))
        box = (
            0,
            math.floor((height - crop_height) / 3),
            crop_width,
            crop_height,
        )
        return crop(
            image,
            box[0], box[1], box[2], box[3],
        ), box
    crop_width = max(40, math.floor(width * 0.5))
    crop_height = max(40, math.floor(height * 0.65))
    box = (
        width - crop_width,
        math.floor((height - crop_height) / 4),
        crop_width,
        crop_height,
    )
    return crop(
        image,
        box[0], box[1], box[2], box[3],
    ), box


def bounded_resize(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    maximum = max(width, height)
    if maximum <= MAXIMUM_DIMENSION:
        return image
    scale = MAXIMUM_DIMENSION / maximum
    target = (max(40, round(width * scale)), max(40, round(height * scale)))
    return cv2.resize(image, target, interpolation=cv2.INTER_AREA)


def census_transform(gray: np.ndarray) -> np.ndarray:
    padded = cv2.copyMakeBorder(gray, 1, 1, 1, 1, cv2.BORDER_REPLICATE)
    center = padded[1:-1, 1:-1]
    output = np.zeros_like(gray, dtype=np.uint8)
    offsets = ((-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0))
    for bit, (offset_x, offset_y) in enumerate(offsets):
        neighbor = padded[
            1 + offset_y:1 + offset_y + gray.shape[0],
            1 + offset_x:1 + offset_x + gray.shape[1],
        ]
        output |= ((neighbor < center).astype(np.uint8) << bit)
    return output


def verification_planes(image: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mean = cv2.GaussianBlur(gray, (0, 0), 3.0, borderType=cv2.BORDER_REPLICATE)
    local = gray.astype(np.int16) - mean.astype(np.int16)
    gradient_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gradient_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    gradient = cv2.magnitude(gradient_x, gradient_y)
    return gray, local, gradient, census_transform(gray)


def detector(method: str) -> Any:
    if method == "akaze":
        return cv2.AKAZE_create(
            descriptor_type=cv2.AKAZE_DESCRIPTOR_MLDB,
            descriptor_size=256,
            descriptor_channels=3,
            threshold=0.001,
            nOctaves=4,
            nOctaveLayers=4,
        )
    return cv2.SIFT_create(
        nfeatures=MAXIMUM_FEATURES * 2,
        nOctaveLayers=3,
        contrastThreshold=0.03,
        edgeThreshold=10,
        sigma=1.6,
    )


def repetition_counts(descriptors: np.ndarray, method: str) -> np.ndarray:
    count = len(descriptors)
    if count < 2:
        return np.ones(count, dtype=np.float32)
    norm = cv2.NORM_HAMMING if method == "akaze" else cv2.NORM_L2
    threshold = 12.0 if method == "akaze" else 60.0
    neighbors = cv2.BFMatcher(norm).knnMatch(
        descriptors, descriptors, k=min(8, count)
    )
    return np.asarray([
        max(1, sum(match.distance <= threshold for match in row))
        for row in neighbors
    ], dtype=np.float32)


def extract_features(image: np.ndarray, method: str) -> Features:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    keypoints, descriptors = detector(method).detectAndCompute(gray, None)
    if descriptors is None or not keypoints:
        descriptor_width = 32 if method == "akaze" else 128
        descriptor_type = np.uint8 if method == "akaze" else np.float32
        return Features(
            np.empty((0, 2), np.float32),
            np.empty(0, np.float32),
            np.empty(0, np.float32),
            np.empty((0, descriptor_width), descriptor_type),
            np.empty(0, np.float32),
        )
    height, width = gray.shape
    order = sorted(range(len(keypoints)), key=lambda index: (
        -keypoints[index].response,
        keypoints[index].pt[1],
        keypoints[index].pt[0],
        keypoints[index].size,
        keypoints[index].angle,
    ))
    cells: dict[tuple[int, int], int] = {}
    selected: list[int] = []
    for index in order:
        keypoint = keypoints[index]
        cell = (
            min(GRID_SIDE - 1, math.floor(keypoint.pt[0] * GRID_SIDE / width)),
            min(GRID_SIDE - 1, math.floor(keypoint.pt[1] * GRID_SIDE / height)),
        )
        count = cells.get(cell, 0)
        if count >= MAXIMUM_FEATURES_PER_CELL:
            continue
        cells[cell] = count + 1
        selected.append(index)
        if len(selected) >= MAXIMUM_FEATURES:
            break
    selected_descriptors = np.ascontiguousarray(descriptors[selected])
    return Features(
        np.asarray([keypoints[index].pt for index in selected], dtype=np.float32),
        np.asarray([keypoints[index].size for index in selected], dtype=np.float32),
        np.asarray([keypoints[index].response for index in selected], dtype=np.float32),
        selected_descriptors,
        repetition_counts(selected_descriptors, method),
    )


def create_variant(
    image: np.ndarray,
    method: str,
    original_offset_x: int,
    original_offset_y: int,
) -> Variant:
    resized = bounded_resize(image)
    gray, local, gradient, census = verification_planes(resized)
    return Variant(
        resized, gray, local, gradient, census, extract_features(resized, method),
        original_offset_x, original_offset_y,
        resized.shape[1] / image.shape[1], resized.shape[0] / image.shape[0],
    )


def expected_positive_model(query: Variant, candidate: Variant) -> dict[str, float]:
    scale_x = query.normalization_scale_x / candidate.normalization_scale_x
    scale_y = query.normalization_scale_y / candidate.normalization_scale_y
    return {
        "scale": (scale_x + scale_y) / 2,
        "translationX": (
            candidate.original_offset_x - query.original_offset_x
        ) * query.normalization_scale_x,
        "translationY": (
            candidate.original_offset_y - query.original_offset_y
        ) * query.normalization_scale_y,
    }


def model_is_close(
    actual: dict[str, float],
    expected: dict[str, float],
    query: Variant,
) -> bool:
    scale_error = abs(actual["scale"] - expected["scale"]) / expected["scale"]
    translation_error = math.hypot(
        actual["translationX"] - expected["translationX"],
        actual["translationY"] - expected["translationY"],
    )
    return scale_error <= 0.03 and translation_error <= max(4.0, max(query.gray.shape) * 0.01)


def create_pairs(sources: list[dict[str, str]]) -> list[Pair]:
    pairs: list[Pair] = []
    for source in sources:
        for mode in ("center", "asymmetric", "severe"):
            pairs.append(Pair(
                f"{source['id']}:original", f"{source['id']}:{mode}", True,
                source["domain"], None,
            ))
    combinations = (("original", "original"), ("center", "center"), ("original", "center"))
    for left_index, left in enumerate(sources):
        for right in sources[left_index + 1:]:
            domain_pair = "::".join(sorted((left["domain"], right["domain"])))
            for left_variant, right_variant in combinations:
                pairs.append(Pair(
                    f"{left['id']}:{left_variant}",
                    f"{right['id']}:{right_variant}",
                    False, None, domain_pair,
                ))
    return pairs


def raw_matches(query: Features, candidate: Features, method: str) -> list[dict[str, float | int]]:
    if len(query.descriptors) == 0 or len(candidate.descriptors) < 2:
        return []
    norm = cv2.NORM_HAMMING if method == "akaze" else cv2.NORM_L2
    matcher = cv2.BFMatcher(norm)
    forward = matcher.knnMatch(query.descriptors, candidate.descriptors, k=2)
    reverse = matcher.knnMatch(candidate.descriptors, query.descriptors, k=1)
    reverse_nearest = {row[0].queryIdx: row[0].trainIdx for row in reverse if row}
    output: list[dict[str, float | int]] = []
    for row in forward:
        if len(row) < 2:
            continue
        best, second = row
        if second.distance <= 0 or reverse_nearest.get(best.trainIdx) != best.queryIdx:
            continue
        weight = 1.0 / math.sqrt(
            float(query.repetition[best.queryIdx] * candidate.repetition[best.trainIdx])
        )
        output.append({
            "queryIndex": best.queryIdx,
            "candidateIndex": best.trainIdx,
            "distance": float(best.distance),
            "secondDistance": float(second.distance),
            "weight": weight,
        })
    return output


def filtered_matches(raw: list[dict[str, float | int]], profile: dict[str, float]) -> list[dict[str, float | int]]:
    return [
        match for match in raw
        if match["distance"] <= profile["maximumDistance"]
        and match["distance"] <= match["secondDistance"] * profile["ratio"]
    ]


def zones_for(points: np.ndarray, width: int, height: int, side: int = 4) -> int:
    if len(points) == 0:
        return 0
    zones = {
        (
            min(side - 1, math.floor(float(point[0]) * side / width)),
            min(side - 1, math.floor(float(point[1]) * side / height)),
        )
        for point in points
    }
    return len(zones)


def refine_model(
    query_points: np.ndarray,
    candidate_points: np.ndarray,
    weights: np.ndarray,
) -> tuple[float, float, float] | None:
    total_weight = float(weights.sum())
    if total_weight <= 0:
        return None
    query_mean = (query_points * weights[:, None]).sum(axis=0) / total_weight
    candidate_mean = (candidate_points * weights[:, None]).sum(axis=0) / total_weight
    centered_query = query_points - query_mean
    centered_candidate = candidate_points - candidate_mean
    denominator = float((weights[:, None] * centered_candidate ** 2).sum())
    if denominator <= 1e-9:
        return None
    scale = float((weights[:, None] * centered_candidate * centered_query).sum() / denominator)
    if scale <= 0:
        return None
    translation = query_mean - scale * candidate_mean
    return scale, float(translation[0]), float(translation[1])


def geometry_evidence(
    query: Variant,
    candidate: Variant,
    matches: list[dict[str, float | int]],
    residual_permille: int,
) -> dict[str, Any]:
    if len(matches) < 2:
        return {
            "inliers": 0, "inlierRatio": 0.0, "weightedSupport": 0.0,
            "queryZones": 0, "candidateZones": 0, "model": None, "models": [],
        }
    ranked = sorted(matches, key=lambda match: (
        match["distance"] / match["secondDistance"], match["distance"],
        match["queryIndex"], match["candidateIndex"],
    ))[:64]
    query_indices = np.asarray([match["queryIndex"] for match in ranked], dtype=np.int32)
    candidate_indices = np.asarray([match["candidateIndex"] for match in ranked], dtype=np.int32)
    query_points = query.features.points[query_indices]
    candidate_points = candidate.features.points[candidate_indices]
    weights = np.asarray([match["weight"] for match in ranked], dtype=np.float64)
    residual = max(3.0, max(query.gray.shape) * residual_permille / 1000)
    bins: dict[tuple[int, int, int], list[float]] = {}

    def add_model(scale: float, translation_x: float, translation_y: float, vote: float) -> None:
        if not 0.2 <= scale <= 5.0:
            return
        key = (
            round(math.log(scale) / 0.025),
            round(translation_x / residual),
            round(translation_y / residual),
        )
        aggregate = bins.setdefault(key, [0.0, 0.0, 0.0, 0.0])
        aggregate[0] += vote
        aggregate[1] += scale * vote
        aggregate[2] += translation_x * vote
        aggregate[3] += translation_y * vote

    for index in range(len(ranked)):
        scale = float(query.features.sizes[query_indices[index]] / candidate.features.sizes[candidate_indices[index]])
        translation = query_points[index] - scale * candidate_points[index]
        add_model(scale, float(translation[0]), float(translation[1]), float(weights[index]))
    for left in range(len(ranked)):
        for right in range(left + 1, len(ranked)):
            candidate_delta = candidate_points[right] - candidate_points[left]
            denominator = float(np.dot(candidate_delta, candidate_delta))
            if denominator <= residual * residual:
                continue
            query_delta = query_points[right] - query_points[left]
            scale = float(np.dot(candidate_delta, query_delta) / denominator)
            translation = query_points[left] - scale * candidate_points[left]
            add_model(
                scale, float(translation[0]), float(translation[1]),
                float(min(weights[left], weights[right])),
            )
    candidates = sorted(bins.items(), key=lambda entry: (-entry[1][0], entry[0]))[:32]
    evaluated_models: list[dict[str, Any]] = []
    for _, aggregate in candidates:
        model = np.asarray([
            aggregate[1] / aggregate[0],
            aggregate[2] / aggregate[0],
            aggregate[3] / aggregate[0],
        ], dtype=np.float64)
        for _ in range(2):
            transformed_points = candidate_points * model[0] + model[1:]
            errors = np.linalg.norm(query_points - transformed_points, axis=1)
            inlier_mask = errors <= residual
            if int(inlier_mask.sum()) < 2:
                break
            refined = refine_model(
                query_points[inlier_mask], candidate_points[inlier_mask], weights[inlier_mask]
            )
            if refined is None:
                break
            model = np.asarray(refined, dtype=np.float64)
        transformed_points = candidate_points * model[0] + model[1:]
        errors = np.linalg.norm(query_points - transformed_points, axis=1)
        inlier_mask = errors <= residual
        inlier_count = int(inlier_mask.sum())
        weighted_support = float(weights[inlier_mask].sum())
        query_zones = zones_for(
            query_points[inlier_mask], query.gray.shape[1], query.gray.shape[0]
        )
        candidate_zones = zones_for(
            candidate_points[inlier_mask], candidate.gray.shape[1], candidate.gray.shape[0]
        )
        evidence = {
            "inliers": inlier_count,
            "inlierRatio": inlier_count / len(ranked),
            "weightedSupport": weighted_support,
            "queryZones": query_zones,
            "candidateZones": candidate_zones,
            "meanResidual": float(errors[inlier_mask].mean()) if inlier_count else None,
            "model": {
                "scale": float(model[0]),
                "translationX": float(model[1]),
                "translationY": float(model[2]),
            },
        }
        score = (
            weighted_support, inlier_count, min(query_zones, candidate_zones),
            -float(evidence["meanResidual"] or math.inf),
        )
        evaluated_models.append({**evidence, "_score": score})
    if not evaluated_models:
        return {
            "inliers": 0, "inlierRatio": 0.0, "weightedSupport": 0.0,
            "queryZones": 0, "candidateZones": 0, "model": None, "models": [],
        }
    evaluated_models.sort(key=lambda evidence: evidence["_score"], reverse=True)
    retained_models = []
    for evidence in evaluated_models[:8]:
        retained = dict(evidence)
        retained.pop("_score")
        retained_models.append(retained)
    return {**retained_models[0], "models": retained_models}


def popcount_bytes(values: np.ndarray) -> np.ndarray:
    table = np.asarray([int(index).bit_count() for index in range(256)], dtype=np.uint8)
    return table[values]


def aligned_verification(query: Variant, candidate: Variant, model: dict[str, float]) -> dict[str, Any]:
    matrix = np.asarray([
        [model["scale"], 0.0, model["translationX"]],
        [0.0, model["scale"], model["translationY"]],
    ], dtype=np.float64)
    query_height, query_width = query.gray.shape
    destination_size = (query_width, query_height)
    warped_gray = cv2.warpAffine(
        candidate.gray, matrix, destination_size,
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0,
    )
    warped_valid = cv2.warpAffine(
        np.full(candidate.gray.shape, 255, dtype=np.uint8), matrix, destination_size,
        flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0,
    )
    valid = cv2.erode(warped_valid, np.ones((5, 5), dtype=np.uint8)) > 0
    valid_count = int(valid.sum())
    if valid_count == 0:
        return {
            "verifiedPixels": 0, "informativeCoverage": 0.0, "agreement": 0.0,
            "contradiction": 1.0, "informativeZones": 0,
        }
    warped_mean = cv2.GaussianBlur(
        warped_gray, (0, 0), 3.0, borderType=cv2.BORDER_REPLICATE
    )
    warped_local = warped_gray.astype(np.int16) - warped_mean.astype(np.int16)
    warped_gradient_x = cv2.Sobel(warped_gray, cv2.CV_32F, 1, 0, ksize=3)
    warped_gradient_y = cv2.Sobel(warped_gray, cv2.CV_32F, 0, 1, ksize=3)
    warped_gradient = cv2.magnitude(warped_gradient_x, warped_gradient_y)
    warped_census = census_transform(warped_gray)
    informative = valid & ((query.gradient >= 12.0) | (warped_gradient >= 12.0))
    informative_count = int(informative.sum())
    if informative_count == 0:
        return {
            "verifiedPixels": valid_count, "informativeCoverage": 0.0, "agreement": 0.0,
            "contradiction": 0.0, "informativeZones": 0,
        }
    local_difference = np.abs(query.local_luminance - warped_local)
    census_distance = popcount_bytes(np.bitwise_xor(query.census, warped_census))
    agreement = informative & ((local_difference <= 12) | (census_distance <= 2))
    contradiction = informative & (local_difference >= 24) & (census_distance >= 4)
    informative_points = np.argwhere(informative)
    zone_points = np.column_stack((informative_points[:, 1], informative_points[:, 0]))
    return {
        "verifiedPixels": valid_count,
        "informativeCoverage": informative_count / valid_count,
        "agreement": int(agreement.sum()) / informative_count,
        "contradiction": int(contradiction.sum()) / informative_count,
        "informativeZones": zones_for(zone_points, query_width, query_height),
    }


def profile_metrics(
    evidence: list[dict[str, Any]],
    domains: list[str],
    decision,
) -> dict[str, Any]:
    decisions = [{**entry, "matches": bool(decision(entry))} for entry in evidence]
    return {
        **metrics(decisions),
        "positiveByDomain": domain_metrics(decisions, domains),
        "negativeByDomainPair": negative_domain_metrics(decisions),
    }


def run_method(
    method: str,
    images: dict[str, np.ndarray],
    sources: list[dict[str, str]],
    pairs: list[Pair],
    domains: list[str],
    locked_profile: bool,
) -> dict[str, Any]:
    variants: dict[str, Variant] = {}
    generation_times: list[float] = []
    feature_counts: list[float] = []
    for source in sources:
        for variant_name in ("original", "center", "asymmetric", "severe"):
            pixels = images[source["id"]]
            offset_x = 0
            offset_y = 0
            if variant_name != "original":
                pixels, box = transformed(pixels, variant_name)
                offset_x, offset_y = box[:2]
            started = time.perf_counter()
            variant = create_variant(pixels, method, offset_x, offset_y)
            generation_times.append((time.perf_counter() - started) * 1000)
            feature_counts.append(float(len(variant.features.points)))
            variants[f"{source['id']}:{variant_name}"] = variant

    matching_times: list[float] = []
    raw_evidence: list[dict[str, Any]] = []
    for pair in pairs:
        started = time.perf_counter()
        raw = raw_matches(
            variants[pair.left].features, variants[pair.right].features, method
        )
        matching_times.append((time.perf_counter() - started) * 1000)
        raw_evidence.append({
            "left": pair.left, "right": pair.right, "positive": pair.positive,
            "domain": pair.domain, "domainPair": pair.domain_pair, "raw": raw,
            "expectedModel": (
                expected_positive_model(variants[pair.left], variants[pair.right])
                if pair.positive else None
            ),
        })

    candidate_profiles: list[dict[str, Any]] = []
    candidate_profile_grid = (
        [LOCKED_AKAZE_PROFILE["candidate"]]
        if locked_profile else CANDIDATE_PROFILES[method]
    )
    for profile in candidate_profile_grid:
        result = profile_metrics(
            raw_evidence, domains,
            lambda entry, selected=profile: len(filtered_matches(entry["raw"], selected))
            >= MINIMUM_CANDIDATE_MATCHES,
        )
        candidate_profiles.append({**profile, **result})

    def candidate_gate(profile: dict[str, Any]) -> bool:
        return (
            float(profile["recall"] or 0) >= 0.35
            and all(
                float(profile["positiveByDomain"][domain]["recall"] or 0) >= 0.2
                for domain in domains
            )
        )

    passing_candidates = [profile for profile in candidate_profiles if candidate_gate(profile)]
    if locked_profile:
        selected_candidate = candidate_profiles[0]
    elif passing_candidates:
        selected_candidate = min(passing_candidates, key=lambda profile: (
            float(profile["falsePositiveRate"] or 0), -float(profile["recall"] or 0),
            profile["maximumDistance"], profile["ratio"],
        ))
    else:
        selected_candidate = max(candidate_profiles, key=lambda profile: (
            min(float(profile["positiveByDomain"][domain]["recall"] or 0) for domain in domains),
            float(profile["recall"] or 0), -float(profile["falsePositiveRate"] or 0),
        ))

    selected_matches = [
        filtered_matches(entry["raw"], selected_candidate) for entry in raw_evidence
    ]
    geometry_profiles: list[dict[str, Any]] = []
    geometry_cache: dict[int, list[dict[str, Any]]] = {}
    geometry_times: list[float] = []
    residual_grid = (
        [LOCKED_AKAZE_PROFILE["geometry"]["residualPermille"]]
        if locked_profile else GEOMETRY_RESIDUAL_PERMILLE
    )
    minimum_inliers_grid = (
        [LOCKED_AKAZE_PROFILE["geometry"]["minimumInliers"]]
        if locked_profile else GEOMETRY_MINIMUM_INLIERS
    )
    minimum_inlier_ratio_grid = (
        [LOCKED_AKAZE_PROFILE["geometry"]["minimumInlierRatio"]]
        if locked_profile else GEOMETRY_MINIMUM_INLIER_RATIOS
    )
    minimum_geometry_zones_grid = (
        [LOCKED_AKAZE_PROFILE["geometry"]["minimumZones"]]
        if locked_profile else GEOMETRY_MINIMUM_ZONES
    )
    for residual_permille in residual_grid:
        evidence: list[dict[str, Any]] = []
        for entry, matches_for_pair in zip(raw_evidence, selected_matches, strict=True):
            started = time.perf_counter()
            geometry = geometry_evidence(
                variants[entry["left"]], variants[entry["right"]],
                matches_for_pair, residual_permille,
            )
            geometry_times.append((time.perf_counter() - started) * 1000)
            evidence.append({**entry, "raw": None, **geometry})
        geometry_cache[residual_permille] = evidence
        for minimum_inliers in minimum_inliers_grid:
            for minimum_inlier_ratio in minimum_inlier_ratio_grid:
                for minimum_zones in minimum_geometry_zones_grid:
                    result = profile_metrics(
                        evidence, domains,
                        lambda entry, a=minimum_inliers, b=minimum_inlier_ratio, c=minimum_zones: (
                            entry["inliers"] >= a
                            and entry["inlierRatio"] >= b
                            and min(entry["queryZones"], entry["candidateZones"]) >= c
                        ),
                    )
                    geometry_profiles.append({
                        "residualPermille": residual_permille,
                        "minimumInliers": minimum_inliers,
                        "minimumInlierRatio": minimum_inlier_ratio,
                        "minimumZones": minimum_zones,
                        **result,
                    })

    def geometry_gate(profile: dict[str, Any]) -> bool:
        return (
            float(profile["recall"] or 0) >= 0.3
            and float(profile["falsePositiveRate"] or 0) <= 0.03
        )

    passing_geometry = [profile for profile in geometry_profiles if geometry_gate(profile)]
    if locked_profile:
        selected_geometry = geometry_profiles[0]
    elif passing_geometry:
        selected_geometry = max(passing_geometry, key=lambda profile: (
            float(profile["recall"] or 0), -float(profile["falsePositiveRate"] or 0),
            profile["minimumZones"], profile["minimumInliers"],
        ))
    else:
        selected_geometry = min(geometry_profiles, key=lambda profile: (
            0 if float(profile["falsePositiveRate"] or 0) <= 0.03 else 1,
            -float(profile["recall"] or 0), float(profile["falsePositiveRate"] or 0),
        ))

    selected_geometry_evidence = geometry_cache[selected_geometry["residualPermille"]]
    verification_evidence: list[dict[str, Any]] = []
    verification_times: list[float] = []
    for entry in selected_geometry_evidence:
        plausible_models = [
            model for model in entry["models"]
            if model["inliers"] >= selected_geometry["minimumInliers"]
            and model["inlierRatio"] >= selected_geometry["minimumInlierRatio"]
            and min(model["queryZones"], model["candidateZones"])
            >= selected_geometry["minimumZones"]
        ]
        geometry_matches = bool(plausible_models)
        verified_models: list[dict[str, Any]] = []
        for model in plausible_models:
            started = time.perf_counter()
            verification = aligned_verification(
                variants[entry["left"]], variants[entry["right"]], model["model"]
            )
            verification_times.append((time.perf_counter() - started) * 1000)
            verified_models.append({**model, **verification})
        if verified_models:
            verification = max(verified_models, key=lambda model: (
                model["agreement"] - 2 * model["contradiction"],
                model["agreement"], -model["contradiction"],
                model["informativeCoverage"], model["weightedSupport"],
            ))
        else:
            verification = {
                "verifiedPixels": 0, "informativeCoverage": 0.0,
                "agreement": 0.0, "contradiction": 1.0, "informativeZones": 0,
            }
        verification_evidence.append({
            **entry, "topFeatureModel": entry["model"],
            "geometryMatches": geometry_matches, **verification,
        })

    positive_transform_diagnostics = []
    ground_truth_verification_times: list[float] = []
    for entry in verification_evidence:
        if not entry["positive"]:
            continue
        query = variants[entry["left"]]
        expected = entry["expectedModel"]
        started = time.perf_counter()
        ground_truth_verification = aligned_verification(
            query, variants[entry["right"]], expected
        )
        ground_truth_verification_times.append((time.perf_counter() - started) * 1000)
        positive_transform_diagnostics.append({
            "positive": True,
            "domain": entry["domain"],
            "topModelClose": (
                entry["topFeatureModel"] is not None
                and model_is_close(entry["topFeatureModel"], expected, query)
            ),
            "retainedModelClose": any(
                model_is_close(model["model"], expected, query) for model in entry["models"]
            ),
            "verifiedModelClose": (
                entry.get("model") is not None and model_is_close(entry["model"], expected, query)
            ),
            **ground_truth_verification,
        })

    final_profiles: list[dict[str, Any]] = []
    minimum_information_grid = (
        [LOCKED_AKAZE_PROFILE["verification"]["minimumInformativeCoverage"]]
        if locked_profile else FINAL_MINIMUM_INFORMATIVE_COVERAGE
    )
    minimum_agreement_grid = (
        [LOCKED_AKAZE_PROFILE["verification"]["minimumAgreement"]]
        if locked_profile else FINAL_MINIMUM_AGREEMENT
    )
    maximum_contradiction_grid = (
        [LOCKED_AKAZE_PROFILE["verification"]["maximumContradiction"]]
        if locked_profile else FINAL_MAXIMUM_CONTRADICTION
    )
    minimum_final_zones_grid = (
        [LOCKED_AKAZE_PROFILE["verification"]["minimumInformativeZones"]]
        if locked_profile else FINAL_MINIMUM_ZONES
    )
    for minimum_information in minimum_information_grid:
        for minimum_agreement in minimum_agreement_grid:
            for maximum_contradiction in maximum_contradiction_grid:
                for minimum_zones in minimum_final_zones_grid:
                    def final_decision(
                        entry: dict[str, Any], a=minimum_information,
                        b=minimum_agreement, c=maximum_contradiction, d=minimum_zones,
                    ) -> bool:
                        return (
                            entry["geometryMatches"]
                            and entry["informativeCoverage"] >= a
                            and entry["agreement"] >= b
                            and entry["contradiction"] <= c
                            and entry["informativeZones"] >= d
                        )
                    result = profile_metrics(verification_evidence, domains, final_decision)
                    insufficient_positive = sum(
                        entry["geometryMatches"] and (
                            entry["informativeCoverage"] < minimum_information
                            or entry["informativeZones"] < minimum_zones
                        )
                        and entry["positive"]
                        for entry in verification_evidence
                    )
                    insufficient_negative = sum(
                        entry["geometryMatches"] and (
                            entry["informativeCoverage"] < minimum_information
                            or entry["informativeZones"] < minimum_zones
                        )
                        and not entry["positive"]
                        for entry in verification_evidence
                    )
                    final_profiles.append({
                        "minimumInformativeCoverage": minimum_information,
                        "minimumAgreement": minimum_agreement,
                        "maximumContradiction": maximum_contradiction,
                        "minimumInformativeZones": minimum_zones,
                        "insufficientEvidencePositive": insufficient_positive,
                        "insufficientEvidenceNegative": insufficient_negative,
                        **result,
                    })

    eligible_final = [
        profile for profile in final_profiles
        if float(profile["falsePositiveRate"] or 0) <= 0.005
    ]
    selected_final = max(eligible_final, key=lambda profile: (
        float(profile["recall"] or 0), -float(profile["falsePositiveRate"] or 0),
    )) if eligible_final else None
    final_gate = selected_final is not None and (
        float(selected_final["recall"] or 0) >= 0.2
        and sum(
            float(selected_final["positiveByDomain"][domain]["recall"] or 0) >= 0.1
            for domain in domains
        ) >= 4
    )

    def recovery_summary(key: str) -> dict[str, Any]:
        decisions = [
            {**entry, "matches": entry[key]} for entry in positive_transform_diagnostics
        ]
        return {
            "overall": metrics(decisions),
            "positiveByDomain": domain_metrics(decisions, domains),
        }

    if selected_final is not None:
        ground_truth_decisions = [{
            **entry,
            "matches": (
                entry["informativeCoverage"] >= selected_final["minimumInformativeCoverage"]
                and entry["agreement"] >= selected_final["minimumAgreement"]
                and entry["contradiction"] <= selected_final["maximumContradiction"]
                and entry["informativeZones"] >= selected_final["minimumInformativeZones"]
            ),
        } for entry in positive_transform_diagnostics]
        ground_truth_verifier = {
            "atSelectedFinalProfile": {
                "overall": metrics(ground_truth_decisions),
                "positiveByDomain": domain_metrics(ground_truth_decisions, domains),
            },
            "scoreByDomain": {
                domain: {
                    "informativeCoverage": summary([
                        entry["informativeCoverage"] for entry in positive_transform_diagnostics
                        if entry["domain"] == domain
                    ]),
                    "agreement": summary([
                        entry["agreement"] for entry in positive_transform_diagnostics
                        if entry["domain"] == domain
                    ]),
                    "contradiction": summary([
                        entry["contradiction"] for entry in positive_transform_diagnostics
                        if entry["domain"] == domain
                    ]),
                }
                for domain in domains
            },
        }
    else:
        ground_truth_verifier = None
    return {
        "method": method,
        "lockedProfile": LOCKED_AKAZE_PROFILE if locked_profile else None,
        "resources": {
            "generationMilliseconds": summary(generation_times),
            "matchingMilliseconds": summary(matching_times),
            "geometryMilliseconds": summary(geometry_times),
            "verificationMilliseconds": summary(verification_times),
            "groundTruthVerificationMilliseconds": summary(ground_truth_verification_times),
            "featureCount": summary(feature_counts),
        },
        "candidateGate": {
            "minimumOverallCoverage": 0.35,
            "minimumPerDomainCoverage": 0.2,
            "pass": candidate_gate(selected_candidate),
            "selectedProfile": selected_candidate,
            "evaluatedProfiles": len(candidate_profiles),
        },
        "geometryGate": {
            "minimumPositiveRecall": 0.3,
            "maximumNegativeRate": 0.03,
            "pass": geometry_gate(selected_geometry),
            "selectedProfile": selected_geometry,
            "evaluatedProfiles": len(geometry_profiles),
        },
        "finalDevelopmentDiagnostic": {
            "maximumFalsePositiveRate": 0.005,
            "minimumRecall": 0.2,
            "domainGuardrail": "at least 10% recall in four of five domains",
            "pass": final_gate,
            "bestEligibleProfile": selected_final,
            "evaluatedProfiles": len(final_profiles),
        },
        "positiveTransformRecovery": {
            "topFeatureModel": recovery_summary("topModelClose"),
            "retainedFeatureModels": recovery_summary("retainedModelClose"),
            "verificationSelectedModel": recovery_summary("verifiedModelClose"),
        },
        "groundTruthTransformVerifier": ground_truth_verifier,
    }


def main() -> None:
    arguments = parse_arguments()
    manifest_path = arguments.manifest.resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    root = manifest_path.parent
    domains = list(manifest["selection"]["domains"])
    sources: list[dict[str, str]] = []
    images: dict[str, np.ndarray] = {}
    for entry in manifest["images"]:
        path = root / entry["file"]
        encoded = path.read_bytes()
        digest = hashlib.sha256(encoded).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {entry['id']}")
        sources.append({"id": entry["id"], "domain": entry["domain"]})
        images[entry["id"]] = read_image(path)
    pairs = create_pairs(sources)
    if arguments.locked_akaze_development_profile and arguments.method not in ("akaze", "both"):
        raise ValueError("The locked development profile requires AKAZE")
    methods = (
        ("akaze",)
        if arguments.locked_akaze_development_profile
        else (("akaze", "sift") if arguments.method == "both" else (arguments.method,))
    )
    method_results = [
        run_method(
            method, images, sources, pairs, domains,
            arguments.locked_akaze_development_profile,
        )
        for method in methods
    ]
    report = {
        "profileVersion": 1,
        "study": (
            "crop-local-v0-akaze-locked-source-disjoint"
            if arguments.locked_akaze_development_profile
            else "crop-local-v0-opencv-oracle-development"
        ),
        "lockedEvaluation": arguments.locked_akaze_development_profile,
        "developmentCorpus": manifest["corpus"],
        "sourceManifest": str(manifest_path),
        "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "environment": {
            "python": platform.python_version(),
            "opencv": cv2.__version__,
            "numpy": np.__version__,
            "platform": platform.platform(),
        },
        "counts": {
            "sourceImages": len(sources),
            "positivePairs": sum(pair.positive for pair in pairs),
            "negativePairs": sum(not pair.positive for pair in pairs),
        },
        "bounds": {
            "maximumDimension": MAXIMUM_DIMENSION,
            "maximumFeatures": MAXIMUM_FEATURES,
            "gridSide": GRID_SIDE,
            "maximumFeaturesPerCell": MAXIMUM_FEATURES_PER_CELL,
        },
        "sourceProvenance": [
            {key: value for key, value in entry.items() if key != "file"}
            for entry in manifest["images"]
        ],
        "methods": method_results,
        "limitations": [
            "This already-inspected corpus is development evidence, not a source-disjoint holdout.",
            "OpenCV AKAZE and SIFT are research oracles, not proposed package dependencies.",
            "The final threshold grid is diagnostic and cannot authorize a public profile.",
            "Corpus-frequency weighting and indexed retrieval are not part of this first oracle gate.",
        ],
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "output": str(arguments.output.resolve()),
        "counts": report["counts"],
        "methods": [{
            "method": result["method"],
            "candidateGate": {
                "pass": result["candidateGate"]["pass"],
                "selectedProfile": result["candidateGate"]["selectedProfile"],
            },
            "geometryGate": {
                "pass": result["geometryGate"]["pass"],
                "selectedProfile": result["geometryGate"]["selectedProfile"],
            },
            "finalDevelopmentDiagnostic": {
                "pass": result["finalDevelopmentDiagnostic"]["pass"],
                "bestEligibleProfile": result["finalDevelopmentDiagnostic"]["bestEligibleProfile"],
            },
        } for result in method_results],
    }, indent=2))


if __name__ == "__main__":
    main()
