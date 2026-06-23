# frozen_string_literal: true

require "rails_helper"

RSpec.describe OpenProject::AbyzTaxonomy::ContractPatches do
  describe ".title_like? (REQ-E-01)" do
    it "is true for a bracketed prefix" do
      expect(described_class.title_like?("[Category] Name")).to be(true)
    end

    it "is false for a normal name" do
      expect(described_class.title_like?("Normal Name")).to be(false)
    end

    it "is false for an empty string" do
      expect(described_class.title_like?("")).to be(false)
    end

    it "is false for nil" do
      expect(described_class.title_like?(nil)).to be(false)
    end
  end

  describe "Projects::CreateContract patch (REQ-E-02, REQ-E-04)" do
    let(:user) { build_stubbed(:admin) }

    it "adds the title-like error on :name for a bracketed project name (AC-14)" do
      model = build_stubbed(:project, name: "[Taxonomy] Project")
      contract = Projects::CreateContract.new(model, user)
      contract.validate

      expect(contract.errors[:name]).to include(described_class::TITLE_LIKE_ERROR)
    end

    it "does NOT add the title-like error for a normal project name" do
      model = build_stubbed(:project, name: "My Project")
      contract = Projects::CreateContract.new(model, user)
      contract.validate

      expect(contract.errors[:name]).not_to include(described_class::TITLE_LIKE_ERROR)
    end
  end

  describe "WorkPackages::CreateContract patch (REQ-E-03, REQ-E-04)" do
    let(:user) { build_stubbed(:admin) }

    it "adds the title-like error on :subject for a bracketed subject" do
      model = build_stubbed(:work_package, subject: "[Section] Task")
      contract = WorkPackages::CreateContract.new(model, user)
      contract.validate

      expect(contract.errors[:subject]).to include(described_class::TITLE_LIKE_ERROR)
    end

    it "does NOT add the title-like error for a normal subject" do
      model = build_stubbed(:work_package, subject: "My Task")
      contract = WorkPackages::CreateContract.new(model, user)
      contract.validate

      expect(contract.errors[:subject]).not_to include(described_class::TITLE_LIKE_ERROR)
    end
  end
end
