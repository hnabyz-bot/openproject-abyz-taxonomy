# frozen_string_literal: true

module AbyzTaxonomy
  class Node < ApplicationRecord
    self.table_name = "abyz_taxonomy_nodes"

    NODE_KINDS = %w[
      title
      project_title
      project_category
      wp_section
      wp_category
    ].freeze

    has_many :children,
             class_name: "AbyzTaxonomy::Node",
             foreign_key: :parent_id,
             inverse_of: :parent,
             dependent: :restrict_with_error
    has_many :assignments,
             class_name: "AbyzTaxonomy::Assignment",
             dependent: :restrict_with_error

    belongs_to :parent,
               class_name: "AbyzTaxonomy::Node",
               optional: true,
               inverse_of: :children

    validates :scope_type, :node_kind, :code, :name, presence: true
    validates :node_kind, inclusion: { in: NODE_KINDS }
    validates :code, uniqueness: true

    scope :active, -> { where(active: true) }
    scope :ordered, -> { order(:scope_type, :position, :name) }
  end
end
