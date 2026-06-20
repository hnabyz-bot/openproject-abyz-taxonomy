# frozen_string_literal: true

module API
  module V3
    module AbyzTaxonomy
      class AbyzTaxonomyAPI < ::API::OpenProjectAPI
        helpers do
          TITLE_KIND = "title"
          PROJECT_ROLE = "title_project"
          WORK_PACKAGE_ROLE = "title_work_package"

          def serialize_node(node)
            {
              id: node.id,
              parentId: node.parent_id,
              scopeType: node.scope_type,
              scopeId: node.scope_id,
              nodeKind: node.node_kind,
              code: node.code,
              name: node.name,
              position: node.position,
              active: node.active,
              rules: node.rules_json
            }
          end

          def serialize_project(project)
            {
              id: project.id,
              identifier: project.identifier,
              name: project.name,
              active: project.active?,
              workspaceType: project.workspace_type,
              statusCode: project.status_code
            }
          end

          def serialize_work_package(work_package)
            {
              id: work_package.id,
              subject: work_package.subject,
              projectId: work_package.project_id,
              projectIdentifier: work_package.project&.identifier,
              status: work_package.status&.name,
              type: work_package.type&.name
            }
          end

          def request_payload
            request_body.presence || params.to_h
          end

          def payload_value(payload, *keys)
            keys.each do |key|
              return payload[key] if payload.key?(key)

              symbol_key = key.to_sym
              return payload[symbol_key] if payload.key?(symbol_key)
            end

            nil
          end

          def require_payload_value(payload, *keys)
            value = payload_value(payload, *keys)
            error!({ _type: "Error", message: "#{keys.first} is required" }, 422) if value.blank?

            value
          end

          def find_title!(code)
            node = ::AbyzTaxonomy::Node.active.find_by(code:, node_kind: TITLE_KIND)
            error!({ _type: "Error", message: "titleCode is unknown" }, 404) unless node

            node
          end

          def find_project!(identifier)
            project = Project.find_by(identifier:)
            error!({ _type: "Error", message: "projectIdentifier is unknown" }, 404) unless project

            project
          end

          def find_work_package!(id)
            work_package = WorkPackage.find_by(id:)
            error!({ _type: "Error", message: "workPackageId is unknown" }, 404) unless work_package

            work_package
          end

          def default_type_for(project)
            project.types.first || Type.first.tap do |type|
              project.types << type if type && !project.types.exists?(type.id)
            end
          end

          def default_status
            Status.find_by(is_default: true) || Status.first
          end

          def default_priority
            IssuePriority.find_by(is_default: true) || IssuePriority.first
          end

          def create_or_update_assignment!(node:, entity:, role:)
            assignment = ::AbyzTaxonomy::Assignment.find_or_initialize_by(
              node:,
              entity:,
              role:
            )
            assignment.position ||= 0
            assignment.save!
            assignment
          end

          def create_title!(payload)
            code = require_payload_value(payload, "code", "titleCode", "title_code").to_s.strip
            name = require_payload_value(payload, "name").to_s.strip

            node = ::AbyzTaxonomy::Node.find_or_initialize_by(code:)
            node.assign_attributes(
              parent: payload_value(payload, "parentCode", "parent_code").presence &&
                ::AbyzTaxonomy::Node.find_by(code: payload_value(payload, "parentCode", "parent_code")),
              scope_type: "global",
              scope_id: nil,
              node_kind: TITLE_KIND,
              name:,
              description: payload_value(payload, "description"),
              icon: payload_value(payload, "icon"),
              color: payload_value(payload, "color"),
              position: payload_value(payload, "position").presence || node.position || 0,
              active: payload_value(payload, "active").nil? ? true : payload_value(payload, "active")
            )
            node.save!
            node
          end

          def create_project_under_title!(payload, title)
            identifier = require_payload_value(payload, "identifier", "projectIdentifier", "project_identifier")
                           .to_s
                           .strip
                           .downcase
            name = require_payload_value(payload, "name").to_s.strip

            project = Project.find_by(identifier:)

            unless project
              call = ::Projects::CreateService.new(user: current_user).call(
                identifier:,
                name:,
                workspace_type: "project",
                status_code: "on_track"
              )
              error!({ _type: "Error", message: call.errors.full_messages.join(", ") }, 422) unless call.success?

              project = call.result
            end

            if project.types.empty?
              types = Type.default.presence || Type.order(:position).limit(3)
              project.types = types if types.any?
            end

            create_or_update_assignment!(node: title, entity: project, role: PROJECT_ROLE)
            project
          end

          def create_work_package_under_title!(payload, title)
            project = find_project!(require_payload_value(payload, "projectIdentifier", "project_identifier"))
            subject = require_payload_value(payload, "subject").to_s.strip
            type = Type.find_by(id: payload_value(payload, "typeId", "type_id")) || default_type_for(project)
            status = Status.find_by(id: payload_value(payload, "statusId", "status_id")) || default_status
            priority = IssuePriority.find_by(id: payload_value(payload, "priorityId", "priority_id")) || default_priority

            error!({ _type: "Error", message: "project has no available work package type" }, 422) unless type
            error!({ _type: "Error", message: "no default status is available" }, 422) unless status
            error!({ _type: "Error", message: "no default priority is available" }, 422) unless priority

            attributes = {
              project:,
              type_id: type.id,
              status_id: status.id,
              priority_id: priority.id,
              subject:,
              description: payload_value(payload, "description")
            }.compact

            call = ::WorkPackages::CreateService.new(user: current_user).call(**attributes)
            unless call.success?
              error!({ _type: "Error", message: call.errors.full_messages.join(", ") }, 422)
            end

            work_package = call.result
            create_or_update_assignment!(node: title, entity: work_package, role: WORK_PACKAGE_ROLE)
            work_package
          end

          def serialize_title_tree
            titles = ::AbyzTaxonomy::Node.active.where(node_kind: TITLE_KIND).ordered

            titles.map do |title|
              project_assignments = ::AbyzTaxonomy::Assignment
                .where(node: title, entity_type: "Project", role: PROJECT_ROLE)
                .includes(:entity)
                .order(:position, :id)

              work_package_assignments = ::AbyzTaxonomy::Assignment
                .where(node: title, entity_type: "WorkPackage", role: WORK_PACKAGE_ROLE)
                .includes(entity: %i[project status type])
                .order(:position, :id)

              {
                title: serialize_node(title),
                projects: project_assignments.filter_map { |assignment| serialize_project(assignment.entity) if assignment.entity },
                workPackages: work_package_assignments.filter_map do |assignment|
                  serialize_work_package(assignment.entity) if assignment.entity
                end
              }
            end
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
              nodes: ::AbyzTaxonomy::Node.active.ordered.map { |node| serialize_node(node) }
            }
          end

          get :tree do
            {
              _type: "AbyzTaxonomyTree",
              titles: serialize_title_tree
            }
          end

          post :titles do
            title = create_title!(request_payload)
            status 201

            {
              _type: "AbyzTaxonomyTitle",
              title: serialize_node(title)
            }
          end

          post :projects do
            payload = request_payload
            title = find_title!(require_payload_value(payload, "titleCode", "title_code"))
            project = create_project_under_title!(payload, title)
            status 201

            {
              _type: "AbyzTaxonomyProject",
              title: serialize_node(title),
              project: serialize_project(project)
            }
          end

          post :project_assignments do
            payload = request_payload
            title = find_title!(require_payload_value(payload, "titleCode", "title_code"))
            project = find_project!(require_payload_value(payload, "projectIdentifier", "project_identifier"))
            assignment = create_or_update_assignment!(node: title, entity: project, role: PROJECT_ROLE)
            status 201

            {
              _type: "AbyzTaxonomyAssignment",
              id: assignment.id,
              title: serialize_node(title),
              project: serialize_project(project)
            }
          end

          post :work_packages do
            payload = request_payload
            title = find_title!(require_payload_value(payload, "titleCode", "title_code"))
            work_package = create_work_package_under_title!(payload, title)
            status 201

            {
              _type: "AbyzTaxonomyWorkPackage",
              title: serialize_node(title),
              workPackage: serialize_work_package(work_package)
            }
          end

          post :work_package_assignments do
            payload = request_payload
            title = find_title!(require_payload_value(payload, "titleCode", "title_code"))
            work_package = find_work_package!(require_payload_value(payload, "workPackageId", "work_package_id"))
            assignment = create_or_update_assignment!(node: title, entity: work_package, role: WORK_PACKAGE_ROLE)
            status 201

            {
              _type: "AbyzTaxonomyAssignment",
              id: assignment.id,
              title: serialize_node(title),
              workPackage: serialize_work_package(work_package)
            }
          end

          post :validate do
            result = ::AbyzTaxonomy::Validation.validate(params.to_h)

            status(result[:valid] ? 200 : 422)
            result
          end
        end
      end
    end
  end
end
