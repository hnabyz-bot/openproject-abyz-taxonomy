# frozen_string_literal: true

require "rails_helper"

RSpec.describe AbyzTaxonomy::Assignment, type: :model do
  describe "role presence validation (REQ-A-07)" do
    it "is invalid without a role" do
      assignment = build(:abyz_taxonomy_assignment, :for_project, role: nil)
      expect(assignment).not_to be_valid
      expect(assignment.errors[:role]).to be_present
    end
  end

  describe "node_id uniqueness scoped to [entity_type, entity_id, role] (REQ-A-07)" do
    let(:node) { create(:abyz_taxonomy_node) }
    let(:project) { create(:project) }

    it "rejects a duplicate (same node, entity, role)" do
      create(:abyz_taxonomy_assignment, node:, entity: project, role: "display_parent")
      duplicate = build(:abyz_taxonomy_assignment, node:, entity: project, role: "display_parent")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:node_id]).to be_present
    end

    it "allows the same node + entity with a different role" do
      create(:abyz_taxonomy_assignment, node:, entity: project, role: "display_parent")
      other_role = build(:abyz_taxonomy_assignment, node:, entity: project, role: "legacy_source")

      expect(other_role).to be_valid
    end
  end

  describe "polymorphic entity (REQ-A-08)" do
    it "stores entity_type Project for a Project entity" do
      assignment = create(:abyz_taxonomy_assignment, :for_project)
      expect(assignment.entity_type).to eq("Project")
      expect(assignment.entity).to be_a(Project)
    end

    it "stores entity_type WorkPackage for a WorkPackage entity" do
      assignment = create(:abyz_taxonomy_assignment, :for_work_package)
      expect(assignment.entity_type).to eq("WorkPackage")
      expect(assignment.entity).to be_a(WorkPackage)
    end
  end
end
