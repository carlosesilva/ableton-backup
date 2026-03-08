"""Tests for scheduler / cron integration."""

import pytest
from ableton_backup.scheduler import validate_cron_frequency


class TestValidateCronFrequency:
    def test_valid_expression(self):
        assert validate_cron_frequency("0 * * * *") is True
        assert validate_cron_frequency("*/15 * * * *") is True
        assert validate_cron_frequency("0 2 * * 1") is True

    def test_invalid_expression_wrong_fields(self):
        assert validate_cron_frequency("* * * *") is False
        assert validate_cron_frequency("not-a-cron") is False
        assert validate_cron_frequency("") is False

    def test_six_fields_is_invalid(self):
        assert validate_cron_frequency("0 * * * * *") is False
