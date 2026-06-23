# frozen_string_literal: true

require "rails_helper"

RSpec.describe AbyzTaxonomy::Node, type: :model do
  describe "presence validations (REQ-A-01)" do
    it "is valid with all required attributes" do
      expect(build(:abyz_taxonomy_node)).to be_valid
    end

    %i[scope_type node_kind code name].each do |attribute|
      it "is invalid without #{attribute}" do
        node = build(:abyz_taxonomy_node, attribute => nil)
        expect(node).not_to be_valid
        expect(node.errors[attribute]).to be_present
      end
    end
  end

  describe "node_kind inclusion (REQ-A-02)" do
    it "rejects a node_kind outside NODE_KINDS" do
      node = build(:abyz_taxonomy_node, node_kind: "invalid_kind")
      expect(node).not_to be_valid
      expect(node.errors[:node_kind]).to be_present
    end

    it "accepts each declared NODE_KIND" do
      described_class::NODE_KINDS.each do |kind|
        node = build(:abyz_taxonomy_node, node_kind: kind)
        node.valid?
        expect(node.errors[:node_kind]).to be_empty
      end
    end
  end

  describe "code uniqueness (REQ-A-03, AC-03)" do
    it "rejects a second node with the same code" do
      create(:abyz_taxonomy_node, code: "project.alpha")
      duplicate = build(:abyz_taxonomy_node, code: "project.alpha")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:code]).to be_present
    end
  end

  describe "dependent: :restrict_with_error (REQ-A-04, AC-04)" do
    it "blocks hard destroy when a child node exists" do
      parent = create(:abyz_taxonomy_node)
      create(:abyz_taxonomy_node, parent:)

      expect(parent.destroy).to be(false)
      expect(parent.errors[:base]).to be_present
      expect(described_class.exists?(parent.id)).to be(true)
    end

    it "blocks hard destroy when an assignment exists" do
      node = create(:abyz_taxonomy_node)
      create(:abyz_taxonomy_assignment, :for_project, node:)

      expect(node.destroy).to be(false)
      expect(node.errors[:base]).to be_present
      expect(described_class.exists?(node.id)).to be(true)
    end
  end

  describe "scopes (REQ-A-05)" do
    it ".active returns only active nodes" do
      active = create(:abyz_taxonomy_node, active: true)
      create(:abyz_taxonomy_node, :inactive)

      expect(described_class.active).to contain_exactly(active)
    end

    it ".ordered sorts by scope_type, position, then name" do
      a = create(:abyz_taxonomy_node, scope_type: "project_tree", position: 1, name: "Bravo")
      b = create(:abyz_taxonomy_node, scope_type: "project_tree", position: 0, name: "Zulu")
      c = create(:abyz_taxonomy_node, scope_type: "project", position: 5, name: "Alpha")

      expect(described_class.ordered.to_a).to eq([c, b, a])
    end
  end

  describe "self-referential association (REQ-A-06)" do
    it "links parent and children bidirectionally" do
      parent = create(:abyz_taxonomy_node)
      child = create(:abyz_taxonomy_node, parent:)

      expect(child.parent).to eq(parent)
      expect(parent.children).to include(child)
    end

    it "allows a node with no parent (optional)" do
      expect(build(:abyz_taxonomy_node, parent: nil)).to be_valid
    end
  end
end
