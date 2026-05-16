import json

from src.cli import main


def test_cli_scores_text_as_json(capsys) -> None:
    assert main(["score", "--text", "Sponsored: click here"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["score"] >= 35
    assert "sentinel:sponsored" in payload["matched_rules"]
