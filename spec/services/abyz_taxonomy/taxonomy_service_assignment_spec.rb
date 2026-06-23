# frozen_string_literal: true

require "rails_helper"

RSpec.describe AbyzTaxonomy::TaxonomyService, type: :service do
  describe ".assign_project_to_title! (REQ-C-09, REQ-C-10)" do
    let(:project) { create(:project) }
    let!(:title) { create(:abyz_taxonomy_node, node_kind: "project_title") }

    it "creates a display_parent assignment" do
      assignment = described_class.assign_project_to_title!(
        title_code: title.code, project_identifier: project.identifier
      )

      expect(assignment).to be_persisted
      expect(assignment.node).to eq(title)
      expect(assignment.entity).to eq(project)
      expect(assignment.role).to eq("display_parent")
    end

    it "is idempotent — a second identical call does not create a second row (AC-10)" do
      2.times do
        described_class.assign_project_to_title!(
          title_code: title.code, project_identifier: project.identifier
        )
      end

      rows = AbyzTaxonomy::Assignment.where(node: title, entity: project, role: "display_parent")
      expect(rows.count).to eq(1)
      expect(rows.first.position).to eq(0)
    end

    it "raises a 404 TaxonomyError for an unknown title_code" do
      expect do
        described_class.assign_project_to_title!(
          title_code: "missing", project_identifier: project.identifier
        )
      end.to raise_error(AbyzTaxonomy::TaxonomyError) { |error| expect(error.status).to eq(404) }
    end
  end

  describe ".assign_work_package_to_section! (REQ-C-09, REQ-C-10)" do
    let(:project) { create(:project) }
    let(:work_package) { create(:work_package, project:) }
    let!(:section) { create(:abyz_taxonomy_node, :wp_section, project:) }

    it "is idempotent" do
      2.times do
        described_class.assign_work_package_to_section!(
          section_code: section.code, work_package_id: work_package.id
        )
      end

      rows = AbyzTaxonomy::Assignment.where(node: section, entity: work_package, role: "display_parent")
      expect(rows.count).to eq(1)
    end

    it "raises a 404 TaxonomyError for an unknown section_code" do
      expect do
        described_class.assign_work_package_to_section!(
          section_code: "missing", work_package_id: work_package.id
        )
      end.to raise_error(AbyzTaxonomy::TaxonomyError) { |error| expect(error.status).to eq(404) }
    end
  end

  describe ".tree (REQ-C-11, REQ-C-12)" do
    it "returns the projectTitles / wpSections structure" do
      result = described_class.tree

      expect(result).to be_a(Hash)
      expect(result.keys).to contain_exactly(:projectTitles, :wpSections)
      expect(result[:projectTitles]).to be_an(Array)
      expect(result[:wpSections]).to be_an(Array)
    end

    it "excludes assignments whose entity no longer resolves (filter_map, REQ-C-12)" do
      project = create(:project)
      title = create(:abyz_taxonomy_node, node_kind: "project_title")
      described_class.assign_project_to_title!(
        title_code: title.code, project_identifier: project.identifier
      )
      # Destroy the underlying project so the polymorphic entity becomes nil.
      AbyzTaxonomy::Assignment.where(node: title).update_all(entity_id: 0)

      entry = described_class.send(:serialize_project_titles).find { |e| e[:title][:code] == title.code }
      expect(entry[:projects]).to eq([])
    end
  end

  describe ".validate (REQ-C-13, REQ-C-14)" do
    it "flags a blank taxonomyCode" do
      result = described_class.validate("projectIdentifier" => "anything")
      expect(result[:valid]).to be(false)
      expect(result[:errors]).to include("taxonomyCode is required")
    end

    it "flags a blank projectIdentifier" do
      result = described_class.validate("taxonomyCode" => "anything")
      expect(result[:valid]).to be(false)
      expect(result[:errors]).to include("projectIdentifier is required")
    end

    it "flags an unknown taxonomyCode" do
      project = create(:project)
      result = described_class.validate(
        "taxonomyCode" => "ghost-code", "projectIdentifier" => project.identifier
      )
      expect(result[:valid]).to be(false)
      expect(result[:errors]).to include("taxonomyCode is unknown")
    end

    it "flags a wp_section that belongs to a different project (AC-11)" do
      project_a = create(:project)
      project_b = create(:project)
      section = create(:abyz_taxonomy_node, :wp_section, project: project_a)

      result = described_class.validate(
        "taxonomyCode" => section.code, "projectIdentifier" => project_b.identifier
      )

      expect(result[:valid]).to be(false)
      expect(result[:errors]).to include("taxonomyCode does not belong to projectIdentifier")
    end
  end

  describe "serializers (REQ-C-15)" do
    it ".serialize_node returns a camelCase hash" do
      node = create(:abyz_taxonomy_node)
      payload = described_class.serialize_node(node)

      expect(payload).to include(
        id: node.id, scopeType: node.scope_type, nodeKind: node.node_kind,
        code: node.code, name: node.name, active: node.active
      )
    end

    it ".serialize_project returns a camelCase hash" do
      project = create(:project)
      payload = described_class.serialize_project(project)

      expect(payload).to include(
        id: project.id, identifier: project.identifier, name: project.name
      )
      expect(payload).to have_key(:workspaceType)
      expect(payload).to have_key(:statusCode)
    end

    it ".serialize_work_package returns a camelCase hash" do
      work_package = create(:work_package)
      payload = described_class.serialize_work_package(work_package)

      expect(payload).to include(
        id: work_package.id, subject: work_package.subject, projectId: work_package.project_id
      )
      expect(payload).to have_key(:projectIdentifier)
      expect(payload).to have_key(:status)
      expect(payload).to have_key(:type)
    end
  end
end
