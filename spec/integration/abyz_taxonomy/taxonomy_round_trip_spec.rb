# frozen_string_literal: true

require "rails_helper"

# End-to-end round trips using real ActiveRecord models and OpenProject core
# factories. No OP CreateService mocking here — the goal is to verify that the
# create -> assign -> serialize pipeline is internally consistent.
RSpec.describe "AbyzTaxonomy taxonomy round trip", type: :integration do
  let(:service) { AbyzTaxonomy::TaxonomyService }

  describe "project title round trip (REQ-G-01)" do
    it "reflects a created title and its assigned project in the tree" do
      project = create(:project)
      title = service.create_project_title!("name" => "Strategy", "code" => "project.strategy")
      service.assign_project_to_title!(title_code: title.code, project_identifier: project.identifier)

      tree = service.tree
      entry = tree[:projectTitles].find { |e| e[:title][:code] == title.code }

      expect(entry).to be_present
      expect(entry[:title][:code]).to eq(title.code)
      expect(entry[:projects].map { |p| p[:identifier] }).to include(project.identifier)
    end
  end

  describe "wp section round trip (REQ-G-02)" do
    it "reflects a created section and its assigned work package in the tree" do
      project = create(:project)
      work_package = create(:work_package, project:)
      section = service.create_wp_section!(
        "projectIdentifier" => project.identifier, "name" => "Backlog", "code" => "wp.backlog"
      )
      service.assign_work_package_to_section!(
        section_code: section.code, work_package_id: work_package.id
      )

      tree = service.tree
      entry = tree[:wpSections].find { |e| e[:section][:code] == section.code }

      expect(entry).to be_present
      expect(entry[:section][:code]).to eq(section.code)
      expect(entry[:project][:identifier]).to eq(project.identifier)
      expect(entry[:workPackages].map { |wp| wp[:id] }).to include(work_package.id)
    end
  end
end
