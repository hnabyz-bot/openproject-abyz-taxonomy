# frozen_string_literal: true

module API
  module V3
    module AbyzTaxonomy
      class AbyzTaxonomyAPI < ::API::OpenProjectAPI
        helpers do
          def request_payload
            request_body.presence || params.to_h
          end

          def taxonomy_error!(error)
            error!({ _type: "Error", message: error.message }, error.status)
          end
        end

        before do
          authenticate
          authorize_admin
        end

        resources :abyz_taxonomy do
          get do
            {
              _type: "AbyzTaxonomyCollection",
              nodes: ::AbyzTaxonomy::Node.active.ordered.map { |node| ::AbyzTaxonomy::TaxonomyService.serialize_node(node) }
            }
          end

          get :tree do
            {
              _type: "AbyzTaxonomyTree",
              **::AbyzTaxonomy::TaxonomyService.tree
            }
          end

          post :titles do
            title = ::AbyzTaxonomy::TaxonomyService.create_project_title!(request_payload)
            status 201

            {
              _type: "AbyzTaxonomyProjectTitle",
              title: ::AbyzTaxonomy::TaxonomyService.serialize_node(title)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :wp_sections do
            section = ::AbyzTaxonomy::TaxonomyService.create_wp_section!(request_payload)
            status 201

            {
              _type: "AbyzTaxonomyWpSection",
              section: ::AbyzTaxonomy::TaxonomyService.serialize_node(section)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :projects do
            project = ::AbyzTaxonomy::TaxonomyService.create_project_under_title!(request_payload, user: current_user)
            status 201

            {
              _type: "AbyzTaxonomyProject",
              project: ::AbyzTaxonomy::TaxonomyService.serialize_project(project)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :project_assignments do
            payload = request_payload
            assignment = ::AbyzTaxonomy::TaxonomyService.assign_project_to_title!(
              title_code: ::AbyzTaxonomy::TaxonomyService.require_value(payload, "titleCode", "title_code"),
              project_identifier: ::AbyzTaxonomy::TaxonomyService.require_value(payload, "projectIdentifier", "project_identifier")
            )
            status 201

            {
              _type: "AbyzTaxonomyAssignment",
              id: assignment.id,
              title: ::AbyzTaxonomy::TaxonomyService.serialize_node(assignment.node),
              project: ::AbyzTaxonomy::TaxonomyService.serialize_project(assignment.entity)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :work_packages do
            work_package = ::AbyzTaxonomy::TaxonomyService.create_work_package_under_section!(request_payload, user: current_user)
            status 201

            {
              _type: "AbyzTaxonomyWorkPackage",
              workPackage: ::AbyzTaxonomy::TaxonomyService.serialize_work_package(work_package)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :work_package_assignments do
            payload = request_payload
            assignment = ::AbyzTaxonomy::TaxonomyService.assign_work_package_to_section!(
              section_code: ::AbyzTaxonomy::TaxonomyService.require_value(payload, "sectionCode", "section_code"),
              work_package_id: ::AbyzTaxonomy::TaxonomyService.require_value(payload, "workPackageId", "work_package_id")
            )
            status 201

            {
              _type: "AbyzTaxonomyAssignment",
              id: assignment.id,
              section: ::AbyzTaxonomy::TaxonomyService.serialize_node(assignment.node),
              workPackage: ::AbyzTaxonomy::TaxonomyService.serialize_work_package(assignment.entity)
            }
          rescue ::AbyzTaxonomy::TaxonomyError => e
            taxonomy_error!(e)
          rescue ActiveRecord::RecordInvalid => e
            taxonomy_error!(::AbyzTaxonomy::TaxonomyError.new(e.record.errors.full_messages.join(", ")))
          end

          post :validate do
            result = ::AbyzTaxonomy::TaxonomyService.validate(params.to_h)

            status(result[:valid] ? 200 : 422)
            result
          end
        end
      end
    end
  end
end
