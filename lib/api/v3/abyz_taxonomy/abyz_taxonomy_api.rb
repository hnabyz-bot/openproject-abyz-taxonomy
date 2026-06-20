# frozen_string_literal: true

module API
  module V3
    module AbyzTaxonomy
      class AbyzTaxonomyAPI < ::API::OpenProjectAPI
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
