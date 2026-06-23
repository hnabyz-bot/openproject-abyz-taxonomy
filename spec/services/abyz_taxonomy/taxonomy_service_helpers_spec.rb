# frozen_string_literal: true

require "rails_helper"

# Pure-helper unit specs for AbyzTaxonomy::TaxonomyService. These cover the
# private helper methods that contain no database access, so they can run fast
# and deterministically. Private methods are reached via `.send`.
RSpec.describe AbyzTaxonomy::TaxonomyService, type: :service do
  describe ".fetch_value (REQ-B-01)" do
    it "reads a string key" do
      expect(described_class.send(:fetch_value, { "code" => "abc" }, "code")).to eq("abc")
    end

    it "reads a symbol key when looked up by string" do
      expect(described_class.send(:fetch_value, { code: "abc" }, "code")).to eq("abc")
    end

    it "reads from an ActionController::Parameters-like object via to_unsafe_h" do
      params = instance_double("ActionController::Parameters")
      allow(params).to receive(:respond_to?).and_call_original
      allow(params).to receive(:respond_to?).with(:to_unsafe_h).and_return(true)
      allow(params).to receive(:to_unsafe_h).and_return({ "code" => "abc" })

      expect(described_class.send(:fetch_value, params, "code")).to eq("abc")
    end

    it "tries each candidate key in order and returns the first match" do
      payload = { "titleCode" => "t-1" }
      expect(described_class.send(:fetch_value, payload, "code", "titleCode")).to eq("t-1")
    end

    it "returns nil when none of the keys are present" do
      expect(described_class.send(:fetch_value, { "other" => 1 }, "code")).to be_nil
    end
  end

  describe ".require_value (REQ-B-02)" do
    it "returns the value when present" do
      expect(described_class.send(:require_value, { "name" => "Alpha" }, "name")).to eq("Alpha")
    end

    it "raises TaxonomyError with a 422 status when the value is blank (AC-01)" do
      expect { described_class.send(:require_value, { name: "" }, "name") }
        .to raise_error(AbyzTaxonomy::TaxonomyError) { |error|
          expect(error.message).to eq("name is required")
          expect(error.status).to eq(422)
        }
    end

    it "raises when the key is missing entirely" do
      expect { described_class.send(:require_value, {}, "name") }
        .to raise_error(AbyzTaxonomy::TaxonomyError, "name is required")
    end
  end

  describe ".normalized_code (REQ-B-03)" do
    it "returns the raw value when present" do
      expect(described_class.send(:normalized_code, "project.alpha", "project", "Alpha"))
        .to eq("project.alpha")
    end

    it "generates a prefix.slug code when the raw value is blank" do
      expect(described_class.send(:normalized_code, "", "project", "Hello World"))
        .to eq("project.hello-world")
    end
  end

  describe ".normalized_identifier (REQ-B-04)" do
    it "returns the downcased raw value when present" do
      expect(described_class.send(:normalized_identifier, "Alpha-One", "ignored"))
        .to eq("alpha-one")
    end

    it "generates a slug from the name when raw value is blank" do
      expect(described_class.send(:normalized_identifier, "", "Hello World")).to eq("hello-world")
    end
  end

  describe ".slug_or_timestamp (REQ-B-05)" do
    it "slugifies a normal string" do
      expect(described_class.send(:slug_or_timestamp, "Hello World!")).to eq("hello-world")
    end

    it "trims leading and trailing separators" do
      expect(described_class.send(:slug_or_timestamp, "  --Foo--  ")).to eq("foo")
    end

    it "falls back to a timestamp slug when input has no alphanumerics" do
      expect(described_class.send(:slug_or_timestamp, "###")).to match(/\Ataxonomy-\d{14}\z/)
    end
  end

  describe ".parse_date (REQ-B-06)" do
    it "returns nil for a blank value" do
      expect(described_class.send(:parse_date, "", "startDate")).to be_nil
    end

    it "parses a valid ISO-8601 date" do
      result = described_class.send(:parse_date, "2026-01-15", "startDate")
      expect(result).to eq(Date.new(2026, 1, 15))
    end

    it "raises TaxonomyError with a field-specific message for a bad format" do
      expect { described_class.send(:parse_date, "15/01/2026", "startDate") }
        .to raise_error(AbyzTaxonomy::TaxonomyError, "startDate must use YYYY-MM-DD")
    end
  end

  describe ".payload_has_key? (REQ-B-06)" do
    it "detects a string key" do
      expect(described_class.send(:payload_has_key?, { "description" => nil }, "description")).to be(true)
    end

    it "detects a symbol key" do
      expect(described_class.send(:payload_has_key?, { description: nil }, "description")).to be(true)
    end

    it "returns false when the key is absent" do
      expect(described_class.send(:payload_has_key?, { "other" => 1 }, "description")).to be(false)
    end
  end
end
