# frozen_string_literal: true

module AbyzTaxonomy
  class Assignment < ApplicationRecord
    self.table_name = "abyz_taxonomy_assignments"

    belongs_to :node,
               class_name: "AbyzTaxonomy::Node",
               inverse_of: :assignments
    belongs_to :entity, polymorphic: true

    validates :role, presence: true
    validates :node_id, uniqueness: { scope: %i[entity_type entity_id role] }
  end
end

