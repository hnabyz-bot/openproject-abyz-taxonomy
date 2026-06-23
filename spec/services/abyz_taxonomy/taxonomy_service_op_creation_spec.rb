# frozen_string_literal: true

require "rails_helper"

# These specs exercise the branches of TaxonomyService that delegate to
# OpenProject's own CreateService objects. The OP services are mocked so the
# tests stay fast and isolated from OP's full creation machinery.
RSpec.describe AbyzTaxonomy::TaxonomyService, type: :service do
  let(:user) { build_stubbed(:admin) }

  describe ".create_project_under_title! (REQ-D-01, REQ-D-02, REQ-D-03)" do
    let!(:title) { create(:abyz_taxonomy_node, node_kind: "project_title") }

    context "when the OP CreateService succeeds" do
      let(:project) { create(:project) }
      let(:service_double) { instance_double(Projects::CreateService) }
      let(:service_result) { instance_double(ServiceResult, success?: true, result: project) }

      before do
        allow(Projects::CreateService).to receive(:new).with(user:).and_return(service_double)
        allow(service_double).to receive(:call).and_return(service_result)
        allow(described_class).to receive(:attach_default_types!)
      end

      it "creates the project and links a display_parent assignment (AC: REQ-D-01)" do
        result = described_class.create_project_under_title!(
          { "titleCode" => title.code, "name" => "New Project", "identifier" => "new-project" },
          user:
        )

        expect(result).to eq(project)
        assignment = AbyzTaxonomy::Assignment.find_by(node: title, entity: project, role: "display_parent")
        expect(assignment).to be_present
      end
    end

    context "when the OP CreateService fails (AC-12, REQ-D-02)" do
      let(:errors_double) { instance_double(ActiveModel::Errors, full_messages: ["boom"]) }
      let(:failure_result) { instance_double(ServiceResult, success?: false, errors: errors_double) }
      let(:service_double) { instance_double(Projects::CreateService) }

      before do
        allow(Projects::CreateService).to receive(:new).with(user:).and_return(service_double)
        allow(service_double).to receive(:call).and_return(failure_result)
      end

      it "raises a TaxonomyError carrying the service error messages" do
        expect do
          described_class.create_project_under_title!(
            { "titleCode" => title.code, "name" => "New Project", "identifier" => "new-project" },
            user:
          )
        end.to raise_error(AbyzTaxonomy::TaxonomyError, /boom/)
      end
    end

    context "when a project with the identifier already exists (REQ-D-03)" do
      let!(:existing) { create(:project, identifier: "existing-project") }

      before do
        allow(Projects::CreateService).to receive(:new)
        allow(described_class).to receive(:attach_default_types!)
      end

      it "reuses the project and does NOT call the OP CreateService" do
        result = described_class.create_project_under_title!(
          { "titleCode" => title.code, "name" => "Existing", "identifier" => "existing-project" },
          user:
        )

        expect(result).to eq(existing)
        expect(Projects::CreateService).not_to have_received(:new)
      end
    end
  end

  describe ".create_work_package_under_section! (REQ-D-04, REQ-D-05, REQ-D-06)" do
    let(:project) { create(:project) }
    let!(:section) { create(:abyz_taxonomy_node, :wp_section, project:) }

    def base_payload(overrides = {})
      { "projectIdentifier" => project.identifier, "sectionCode" => section.code, "subject" => "Task" }
        .merge(overrides)
    end

    context "when creation succeeds" do
      let(:work_package) { create(:work_package, project:) }
      let(:service_double) { instance_double(WorkPackages::CreateService) }
      let(:service_result) { instance_double(ServiceResult, success?: true, result: work_package) }

      before do
        allow(described_class).to receive(:default_type_for).and_return(instance_double(Type, id: 1))
        allow(described_class).to receive(:default_status).and_return(instance_double(Status, id: 2))
        allow(described_class).to receive(:default_priority).and_return(instance_double(IssuePriority, id: 3))
        allow(WorkPackages::CreateService).to receive(:new).with(user:).and_return(service_double)
        allow(service_double).to receive(:call).and_return(service_result)
      end

      it "creates the work package and links it to the section (REQ-D-04)" do
        result = described_class.create_work_package_under_section!(base_payload, user:)

        expect(result).to eq(work_package)
        assignment = AbyzTaxonomy::Assignment.find_by(
          node: section, entity: work_package, role: "display_parent"
        )
        expect(assignment).to be_present
      end
    end

    context "when a required default is missing (REQ-D-05)" do
      before do
        allow(described_class).to receive(:default_type_for).and_return(instance_double(Type, id: 1))
        allow(described_class).to receive(:default_status).and_return(instance_double(Status, id: 2))
        allow(described_class).to receive(:default_priority).and_return(instance_double(IssuePriority, id: 3))
      end

      it "raises when no work package type is available" do
        allow(described_class).to receive(:default_type_for).and_return(nil)
        expect { described_class.create_work_package_under_section!(base_payload, user:) }
          .to raise_error(AbyzTaxonomy::TaxonomyError, "project has no available work package type")
      end

      it "raises when no default status is available (AC-13)" do
        allow(described_class).to receive(:default_status).and_return(nil)
        expect { described_class.create_work_package_under_section!(base_payload, user:) }
          .to raise_error(AbyzTaxonomy::TaxonomyError, "no default status is available")
      end

      it "raises when no default priority is available" do
        allow(described_class).to receive(:default_priority).and_return(nil)
        expect { described_class.create_work_package_under_section!(base_payload, user:) }
          .to raise_error(AbyzTaxonomy::TaxonomyError, "no default priority is available")
      end
    end

    context "when a date has a bad format (REQ-D-06)" do
      before do
        allow(described_class).to receive(:default_type_for).and_return(instance_double(Type, id: 1))
        allow(described_class).to receive(:default_status).and_return(instance_double(Status, id: 2))
        allow(described_class).to receive(:default_priority).and_return(instance_double(IssuePriority, id: 3))
      end

      it "raises a field-specific TaxonomyError for an invalid startDate" do
        payload = base_payload("startDate" => "15/01/2026")
        expect { described_class.create_work_package_under_section!(payload, user:) }
          .to raise_error(AbyzTaxonomy::TaxonomyError, "startDate must use YYYY-MM-DD")
      end
    end
  end
end
