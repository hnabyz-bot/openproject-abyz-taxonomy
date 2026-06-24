# frozen_string_literal: true

require "rails_helper"

RSpec.describe AbyzTaxonomy::TaxonomyService, type: :service do
  describe ".create_project_title! (REQ-C-01, REQ-C-02)" do
    it "persists a node as a project_title in the project_tree scope" do
      node = described_class.create_project_title!("name" => "Alpha", "code" => "project.alpha")

      expect(node).to be_persisted
      expect(node.node_kind).to eq("project_title")
      expect(node.scope_type).to eq("project_tree")
      expect(node.scope_id).to be_nil
      expect(node.name).to eq("Alpha")
    end

    it "merges taxonomyType into rules_json" do
      node = described_class.create_project_title!(
        "name" => "Alpha", "code" => "project.alpha", "taxonomyType" => "milestone"
      )

      expect(node.rules_json["taxonomyType"]).to eq("milestone")
    end

    it "defaults taxonomyType to 'title' when not supplied" do
      node = described_class.create_project_title!("name" => "Alpha", "code" => "project.alpha")
      expect(node.rules_json["taxonomyType"]).to eq("title")
    end

    it "is an idempotent upsert keyed by code (AC-05)" do
      described_class.create_project_title!("name" => "Alpha", "code" => "project.beta")
      described_class.create_project_title!("name" => "Beta Renamed", "code" => "project.beta")

      nodes = AbyzTaxonomy::Node.where(code: "project.beta")
      expect(nodes.count).to eq(1)
      expect(nodes.first.name).to eq("Beta Renamed")
    end
  end

  describe ".create_wp_section! (REQ-C-03, REQ-C-04)" do
    let(:project) { create(:project) }

    it "creates a wp_section scoped to the project" do
      node = described_class.create_wp_section!(
        "projectIdentifier" => project.identifier, "name" => "Backlog", "code" => "wp.section"
      )

      expect(node).to be_persisted
      expect(node.node_kind).to eq("wp_section")
      expect(node.scope_type).to eq("project")
      expect(node.scope_id).to eq(project.id)
    end

    it "matches projectIdentifier case-insensitively" do
      project.update!(identifier: "proj-case")

      node = described_class.create_wp_section!(
        "projectIdentifier" => "PROJ-CASE", "name" => "Backlog", "code" => "wp.section.case"
      )

      expect(node.scope_id).to eq(project.id)
    end

    it "raises a 404 TaxonomyError for an unknown project identifier (AC-06)" do
      expect { described_class.create_wp_section!("projectIdentifier" => "ghost", "name" => "X") }
        .to raise_error(AbyzTaxonomy::TaxonomyError) { |error| expect(error.status).to eq(404) }
    end
  end

  describe ".update_node! (REQ-C-05, REQ-C-06)" do
    it "updates only fields present in the payload" do
      node = create(:abyz_taxonomy_node, name: "Old", description: "keep me")

      described_class.update_node!(node.code, "name" => "New")

      node.reload
      expect(node.name).to eq("New")
      expect(node.description).to eq("keep me")
    end

    it "does NOT merge taxonomyType for a wp_section node (AC-07)" do
      node = create(:abyz_taxonomy_node, :wp_section, rules_json: {})

      described_class.update_node!(node.code, "taxonomyType" => "category")

      expect(node.reload.rules_json["taxonomyType"]).to be_nil
    end

    it "DOES merge taxonomyType for a project_title node" do
      node = create(:abyz_taxonomy_node, node_kind: "project_title", rules_json: {})

      described_class.update_node!(node.code, "taxonomyType" => "category")

      expect(node.reload.rules_json["taxonomyType"]).to eq("category")
    end

    it "raises ActiveRecord::RecordInvalid on a uniqueness collision when renaming code" do
      create(:abyz_taxonomy_node, code: "project.taken")
      node = create(:abyz_taxonomy_node, code: "project.original")

      expect { described_class.update_node!(node.code, "code" => "project.taken") }
        .to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe ".delete_node! (REQ-C-07, REQ-C-08)" do
    let!(:node) { create(:abyz_taxonomy_node) }
    let!(:child) { create(:abyz_taxonomy_node, parent: node) }
    let!(:rule) do
      AbyzTaxonomy::Rule.create!(node:, applies_to: "project", severity: "block", active: true)
    end

    it "orphans children, deactivates rules, and soft-deletes the node (AC-08)" do
      described_class.delete_node!(node.code)

      expect(child.reload.parent_id).to be_nil
      expect(rule.reload.active).to be(false)
      expect(node.reload.active).to be(false)
      # row is preserved (soft delete only)
      expect(AbyzTaxonomy::Node.exists?(node.id)).to be(true)
    end

    it "rolls back every change when node.update! raises (AC-09)" do
      allow(described_class).to receive(:find_node!).and_return(node)
      allow(node).to receive(:update!).and_raise(ActiveRecord::RecordInvalid.new(node))

      expect { described_class.delete_node!(node.code) }.to raise_error(ActiveRecord::RecordInvalid)

      expect(child.reload.parent_id).to eq(node.id)
      expect(rule.reload.active).to be(true)
    end
  end
end
