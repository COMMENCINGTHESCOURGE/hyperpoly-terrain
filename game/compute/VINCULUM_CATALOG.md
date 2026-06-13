#!/usr/bin/env python3
"""
VINCULUM CATALOG — HYPERPOLY Cross-Domain Ratio Mappings
================================================================
Every vinculum is a ratio of two opposing quantities that bounds
a system's operating regime. The same structural relationship appears
across domains with different names.

Format:
  vinculum: numerator / denominator
    Description of what the ratio measures and its threshold behavior
    layer: layer_name
    domain: primary_domain
      maps to domain2 as ratio2,
      domain3 as ratio3
    threshold: condition that triggers regime change

Precept:
  If it cannot be measured in real time, it is not a vinculum — it is commentary.
  If it cannot be mapped to at least 3 domains, it is not a vinculum — it is a local observation.
"""
import os, sys

def catalog_entry(numerator, denominator, description, layer, domain, mappings, threshold):
    print(f"\n{'='*72}")
    print(f"vinculum: {numerator} / {denominator}")
    print(f"  {description}")
    print(f"  layer: {layer}")
    print(f"  domain: {domain}")
    for target, ratio in mappings:
        print(f"    maps to {target} as {ratio}")
    print(f"  threshold: {threshold}")

# =============================================================================
# OBSERVED VINCULUMS (from existing WGSL code)
# =============================================================================

catalog_entry(
    "depth_resolution", "subvolume_span",
    "Ratio of leaf-node octree cells vs parent-cell spans at each LOD level. "
    "When ratio < 1, the system cannot resolve detail at its own span.",
    "compute", "terrain",
    [
        ("swarm", "search_depth / coverage_radius"),
        ("evacuation", "egress_detail / sector_scale"),
        ("surveying", "sample_density / transect_length"),
        ("radar", "range_gate_resolution / pulse_width"),
    ],
    "< 0.5 -> spatial aliasing (features smaller than span are invisible)"
)



catalog_entry(
    "culling_efficiency", "visible_fraction",
    "Ratio of active brick cells vs total grid cells after visibility culling. "
    "When ratio > 1, more bricks are active than visible.",
    "compute", "terrain",
    [
        ("swarm", "search_coverage / explored_fraction"),
        ("evacuation", "safe_zone_ratio / total_area"),
        ("attention", "foveal_bandwidth / visual_field"),
        ("radar", "tracked_targets / detectable_returns"),
    ],
    "> 1.0 -> oversubscription (culling fails to filter occluded)"
)

catalog_entry(
    "advection_coherence", "turbulent_diffusion",
    "Measures how much of the advection field preserves laminar flow vs. "
    "developing eddies. When ratio < 1, the field is turbulence-dominated.",
    "simulation", "terrain",
    [
        ("economy", "liquidity / volatility"),
        ("AI", "training_stability / gradient_noise"),
        ("climate", "jet_stream_coherence / eddy_diffusivity"),
        ("traffic", "platoon_stability / lane_change_frequency"),
    ],
    "< 0.3 -> turbulent regime (transport is diffusive, not advective)"
)

# =============================================================================
# DERIVED VINCULUMS (from historical analysis)
# =============================================================================

catalog_entry(
    "knowledge_preservation_rate", "knowledge_loss_rate",
    "Ratio of information transmitted to the next generation vs. "
    "information lost due to institutional collapse. "
    "When ratio < 1, net knowledge contracts. Below ~0.3, systematic "
    "loss exceeds preservation — the dark age regime.",
    "civilization", "history",
    [
        ("compute", "cache_hit_rate / cache_eviction_rate"),
        ("ecology", "speciation_rate / extinction_rate"),
        ("AI", "training_data_retention / catastrophic_forgetting"),
        ("biology", "DNA_repair_efficiency / mutation_accumulation"),
        ("economics", "capital_formation / depreciation_rate"),
        ("software", "documentation_freshness / knowledge_rot"),
        ("organization", "onboarding_throughput / turnover_rate"),
        ("immunology", "memory_cell_retention / pathogen_mutation_rate"),
        ("linguistics", "lexicon_acquisition_rate / language_attrition_rate"),
        ("archaeology", "artifact_preservation_odds / taphonomic_loss"),
    ],
    "< 1.0 -> stagnation; < 0.3 -> dark age regime"
)

catalog_entry(
    "institutional_resilience", "institutional_rigidity",
    "Capacity to absorb perturbation vs. resistance to change. "
    "When ratio > 10, rigidity dominates — the system is brittle. "
    "When ratio < 0.1, resilience without structure produces anarchy.",
    "governance", "society",
    [
        ("compute", "load_balancing_headroom / scheduling_overhead"),
        ("evacuation", "redundant_exits / checkpoint_contention"),
        ("biology", "phenotypic_plasticity / genetic_fixation"),
        ("economics", "market_diversity / regulatory_friction"),
        ("AI", "exploration_rate / exploitation_convergence"),
        ("materials", "ductility / yield_strength"),
        ("ecology", "functional_redundancy / competitive_exclusion"),
        ("networks", "path_diversity / shortest_path_concentration"),
        ("military", "force_dispersion / command_chain_depth"),
    ],
    "> 10.0 -> brittle; < 0.1 -> anarchy"
)

catalog_entry(
    "signal_strength", "noise_floor",
    "Ratio of detectable signal power to background noise power. "
    "When ratio < 1, the channel is unusable. Foundational vinculum "
    "of information theory: if you cannot transmit a measurement, "
    "no other vinculum can be observed.",
    "information", "communication",
    [
        ("compute", "precision / rounding_error"),
        ("physics", "measurement_delta / instrument_uncertainty"),
        ("astronomy", "flux_signal / sky_background"),
        ("neuroscience", "evoked_potential / EEG_noise"),
        ("finance", "alpha_generation / market_microstructure_noise"),
        ("radar", "return_amplitude / clutter_density"),
        ("seismology", "P_wave_amplitude / microseismic_noise"),
    ],
    "< 1.0 -> channel unusable (signal indistinguishable from noise)"
)

catalog_entry(
    "innovation_capture_rate", "innovation_dissipation_rate",
    "Ratio of novel discoveries integrated into the knowledge graph vs. "
    "discoveries made and then lost — papers no one cites, methods "
    "no one replicates, code that never runs. "
    "When ratio < 1, the knowledge graph shrinks despite high output.",
    "epistemology", "science",
    [
        ("compute", "merge_request_acceptance / commit_abandonment_rate"),
        ("AI", "model_checkpoint_adoption / training_run_bitrot"),
        ("publishing", "citation_uptake / publication_decay_rate"),
        ("biology", "horizontal_gene_transfer / gene_silencing"),
        ("economics", "technology_adoption / obsolescence_rate"),
        ("urbanism", "building_reuse_rate / demolition_rate"),
    ],
    "< 0.5 -> growing graveyard (more lost than integrated per cycle)"
)



catalog_entry(
    "attentional_bandwidth", "information_arrival_rate",
    "Ratio of what a system can process per unit time vs. what arrives. "
    "When ratio < 1, the system is perpetually backlogged. "
    "This is the vinculum of the modern internet: information arrives "
    "faster than any human or algorithm can integrate it. "
    "The failure mode is not ignorance — it is drowning while thirsty.",
    "cognition", "attention",
    [
        ("compute", "throughput / ingress_rate"),
        ("economics", "processing_capacity / order_arrival_rate"),
        ("neuroscience", "working_memory_capacity / sensory_input_rate"),
        ("networks", "buffer_size / packet_arrival_rate"),
        ("journalism", "verification_rate / breaking_news_rate"),
        ("AI", "context_window / token_stream_length"),
    ],
    "< 0.5 -> chronic backlog (perpetual queue, no deep processing)"
)

catalog_entry(
    "differentiation_rate", "integration_rate",
    "Ratio of new distinct forms produced per unit time vs. existing "
    "forms connected or merged. When ratio >> 1, the system fragments: "
    "every agent has its own standard. When ratio << 1, the system "
    "homogenizes: diversity collapses into a single monoculture.",
    "complexity", "evolution",
    [
        ("biology", "cladogenesis_rate / coalescence_rate"),
        ("linguistics", "language_birth_rate / language_death_rate"),
        ("software", "library_creation_rate / library_deprecation_rate"),
        ("economics", "product_diversification / market_consolidation"),
        ("crypto", "altcoin_creation_rate / chain_merge_rate"),
        ("religion", "sect_schism_rate / ecumenical_unification_rate"),
        ("AI", "model_checkpoint_branching / model_merge_conflict_rate"),
    ],
    "> 3.0 -> fragmentation; < 0.3 -> monoculture"
)

# =============================================================================
# Summary
# =============================================================================

print(f"\n{'='*72}")
print("VINCULUM CATALOG: 9 entries across 8 layers")
print(f"{'='*72}")
print("  compute: depth_resolution/subvolume_span, culling_efficiency/visible_fraction")
print("  simulation: advection_coherence/turbulent_diffusion")
print("  civilization: knowledge_preservation_rate/knowledge_loss_rate")
print("  governance: institutional_resilience/institutional_rigidity")
print("  information: signal_strength/noise_floor")
print("  epistemology: innovation_capture_rate/innovation_dissipation_rate")
print("  cognition: attentional_bandwidth/information_arrival_rate")
print("  complexity: differentiation_rate/integration_rate")
print(f"{'='*72}")
print("Domain mapping count: 59 cross-domain ratio mappings")
