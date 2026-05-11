import json

from researchclaw.pipeline._helpers import (
    _collect_experiment_results,
    _read_metrics_artifacts,
    _write_metrics_contract,
)


def test_metrics_contract_roundtrip(tmp_path):
    contract = _write_metrics_contract(
        tmp_path,
        {
            "baseline": {"accuracy": 0.71, "macro_f1": 0.68},
            "proposed": {"accuracy": 0.82, "macro_f1": 0.79},
        },
        metric_key="macro_f1",
        metric_direction="maximize",
        source="unit-test",
    )

    assert contract["valid"] is True
    assert (tmp_path / "metrics.json").exists()
    assert (tmp_path / "best_score.json").exists()

    metrics, structured, sources = _read_metrics_artifacts(tmp_path)
    assert structured is None
    assert sources
    assert metrics["proposed/macro_f1"] == 0.79
    assert metrics["macro_f1"] == 0.79


def test_collect_experiment_results_reads_stage_metrics_contract(tmp_path):
    run_dir = tmp_path / "run"
    stage_runs = run_dir / "stage-12" / "runs"
    _write_metrics_contract(
        stage_runs,
        {"accuracy": 0.83, "macro_f1": 0.81},
        metric_key="macro_f1",
        metric_direction="maximize",
        source="stage-12",
    )

    collected = _collect_experiment_results(
        run_dir,
        metric_key="macro_f1",
        metric_direction="maximize",
    )

    assert collected["runs"]
    assert collected["metrics_summary"]["macro_f1"]["mean"] == 0.81
    assert collected["best_run"]["metrics"]["macro_f1"] == 0.81


def test_read_metrics_artifacts_accepts_sandbox_project_results_json(tmp_path):
    project = tmp_path / "sandbox" / "_project_1"
    project.mkdir(parents=True)
    (project / "results.json").write_text(
        json.dumps(
            {
                "conditions": {
                    "tfidf_svm": {"macro_f1": 0.76, "accuracy": 0.78},
                    "tfidf_logreg": {"macro_f1": 0.73, "accuracy": 0.75},
                }
            }
        ),
        encoding="utf-8",
    )

    metrics, structured, sources = _read_metrics_artifacts(project)

    assert structured is not None
    assert sources == [str(project / "results.json")]
    assert metrics["conditions/tfidf_svm/macro_f1"] == 0.76
