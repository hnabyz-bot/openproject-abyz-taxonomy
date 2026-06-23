# frozen_string_literal: true

FactoryBot.define do
  factory :abyz_taxonomy_node, class: "AbyzTaxonomy::Node" do
    sequence(:code) { |n| "project.node#{n}" }
    sequence(:name) { |n| "Taxonomy Node #{n}" }
    node_kind  { "project_title" }
    scope_type { "project_tree" }
    position   { 0 }
    active     { true }

    # A wp_section node is scoped to a single project. The optional `project`
    # transient lets a caller bind the node to a real OP Project so that
    # scope_id matches what TaxonomyService#find_wp_section! expects.
    trait :wp_section do
      node_kind  { "wp_section" }
      scope_type { "project" }

      transient do
        project { nil }
      end

      after(:build) do |node, evaluator|
        node.scope_id = evaluator.project&.id
      end
    end

    trait :inactive do
      active { false }
    end
  end
end
