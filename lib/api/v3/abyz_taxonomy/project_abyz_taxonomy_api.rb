# frozen_string_literal: true

module API
  module V3
    module AbyzTaxonomy
      class ProjectAbyzTaxonomyAPI < ::API::OpenProjectAPI
        helpers do
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

          def serialize_assignment(assignment)
            {
              id: assignment.id,
              nodeId: assignment.node_id,
              role: assignment.role,
              position: assignment.position,
              node: serialize_node(assignment.node)
            }
          end
        end

        before do
          authenticate
          authorize_admin
        end

        get :abyz_taxonomy do
          assignments = ::AbyzTaxonomy::Assignment.where(entity: @project).includes(:node)

          {
            _type: "AbyzProjectTaxonomy",
            projectId: @project.id,
            projectIdentifier: @project.identifier,
            assignments: assignments.map { |assignment| serialize_assignment(assignment) }
          }
        end
      end
    end
  end
end
