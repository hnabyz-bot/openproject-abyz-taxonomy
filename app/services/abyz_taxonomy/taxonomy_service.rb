# frozen_string_literal: true

module AbyzTaxonomy
  class TaxonomyError < StandardError
    attr_reader :status

    def initialize(message, status: 422)
      super(message)
      @status = status
    end
  end

  module TaxonomyService
    PROJECT_TITLE_KIND = "project_title"
    LEGACY_TITLE_KIND = "title"
    WP_SECTION_KIND = "wp_section"
    DISPLAY_PARENT_ROLE = "display_parent"
    LEGACY_PROJECT_ROLE = "title_project"
    LEGACY_WORK_PACKAGE_ROLE = "title_work_package"
    PROJECT_TITLE_KINDS = [PROJECT_TITLE_KIND, LEGACY_TITLE_KIND].freeze
    PROJECT_ASSIGNMENT_ROLES = [DISPLAY_PARENT_ROLE, LEGACY_PROJECT_ROLE].freeze
    WORK_PACKAGE_ASSIGNMENT_ROLES = [DISPLAY_PARENT_ROLE, LEGACY_WORK_PACKAGE_ROLE].freeze

    module_function

    def fetch_value(payload, *keys)
      hash = payload.respond_to?(:to_unsafe_h) ? payload.to_unsafe_h : payload.to_h

      keys.each do |key|
        return hash[key] if hash.key?(key)

        symbol_key = key.to_sym
        return hash[symbol_key] if hash.key?(symbol_key)
      end

      nil
    end

    def require_value(payload, *keys)
      value = fetch_value(payload, *keys)
      raise TaxonomyError, "#{keys.first} is required" if value.blank?

      value
    end

    def create_project_title!(payload)
      name = require_value(payload, "name").to_s.strip
      code = normalized_code(fetch_value(payload, "code", "titleCode", "title_code"), "project", name)
      taxonomy_type = fetch_value(payload, "taxonomyType", "taxonomy_type").presence || "title"

      node = Node.find_or_initialize_by(code:)
      node.assign_attributes(
        parent: parent_from_payload(payload),
        scope_type: "project_tree",
        scope_id: nil,
        node_kind: PROJECT_TITLE_KIND,
        name:,
        description: fetch_value(payload, "description"),
        icon: fetch_value(payload, "icon"),
        color: fetch_value(payload, "color"),
        position: fetch_value(payload, "position").presence || node.position || 0,
        active: fetch_value(payload, "active").nil? ? true : fetch_value(payload, "active"),
        rules_json: (node.rules_json || {}).merge("taxonomyType" => taxonomy_type)
      )
      node.save!
      node
    end

    def create_wp_section!(payload)
      project = find_project!(require_value(payload, "projectIdentifier", "project_identifier"))
      name = require_value(payload, "name").to_s.strip
      code = normalized_code(fetch_value(payload, "code", "sectionCode", "section_code"), "wp.#{project.identifier}", name)

      node = Node.find_or_initialize_by(code:)
      node.assign_attributes(
        parent: parent_from_payload(payload),
        scope_type: "project",
        scope_id: project.id,
        node_kind: WP_SECTION_KIND,
        name:,
        description: fetch_value(payload, "description"),
        icon: fetch_value(payload, "icon"),
        color: fetch_value(payload, "color"),
        position: fetch_value(payload, "position").presence || node.position || 0,
        active: fetch_value(payload, "active").nil? ? true : fetch_value(payload, "active")
      )
      node.save!
      node
    end

    def create_project_under_title!(payload, user:)
      title = find_project_title!(require_value(payload, "titleCode", "title_code"))
      name = require_value(payload, "name").to_s.strip
      identifier = normalized_identifier(fetch_value(payload, "identifier", "projectIdentifier", "project_identifier"), name)
      project = Project.find_by(identifier:)

      unless project
        call = ::Projects::CreateService.new(user:).call(
          identifier:,
          name:,
          workspace_type: "project",
          status_code: "on_track"
        )
        raise TaxonomyError, call.errors.full_messages.join(", ") unless call.success?

        project = call.result
      end

      attach_default_types!(project)
      create_or_update_assignment!(node: title, entity: project, role: DISPLAY_PARENT_ROLE)
      project
    end

    def create_work_package_under_section!(payload, user:)
      project = find_project!(require_value(payload, "projectIdentifier", "project_identifier"))
      section = find_wp_section!(require_value(payload, "sectionCode", "section_code"), project:)
      subject = require_value(payload, "subject").to_s.strip
      type = Type.find_by(id: fetch_value(payload, "typeId", "type_id")) || default_type_for(project)
      status = Status.find_by(id: fetch_value(payload, "statusId", "status_id")) || default_status
      priority = IssuePriority.find_by(id: fetch_value(payload, "priorityId", "priority_id")) || default_priority

      raise TaxonomyError, "project has no available work package type" unless type
      raise TaxonomyError, "no default status is available" unless status
      raise TaxonomyError, "no default priority is available" unless priority

      call = ::WorkPackages::CreateService.new(user:).call(
        project:,
        type_id: type.id,
        status_id: status.id,
        priority_id: priority.id,
        subject:,
        description: fetch_value(payload, "description")
      )
      raise TaxonomyError, call.errors.full_messages.join(", ") unless call.success?

      work_package = call.result
      create_or_update_assignment!(node: section, entity: work_package, role: DISPLAY_PARENT_ROLE)
      work_package
    end

    def assign_project_to_title!(title_code:, project_identifier:)
      title = find_project_title!(title_code)
      project = find_project!(project_identifier)

      create_or_update_assignment!(node: title, entity: project, role: DISPLAY_PARENT_ROLE)
    end

    def assign_work_package_to_section!(section_code:, work_package_id:)
      section = find_wp_section!(section_code)
      work_package = find_work_package!(work_package_id)

      create_or_update_assignment!(node: section, entity: work_package, role: DISPLAY_PARENT_ROLE)
    end

    def tree
      {
        projectTitles: serialize_project_titles,
        wpSections: serialize_wp_sections
      }
    end

    def validate(payload)
      taxonomy_code = fetch_value(payload, "taxonomyCode", "taxonomy_code")
      project_identifier = fetch_value(payload, "projectIdentifier", "project_identifier")
      errors = []

      errors << "taxonomyCode is required" if taxonomy_code.blank?
      errors << "projectIdentifier is required" if project_identifier.blank?

      node = Node.active.find_by(code: taxonomy_code) if taxonomy_code.present?
      errors << "taxonomyCode is unknown" if taxonomy_code.present? && node.nil?

      project = Project.find_by(identifier: project_identifier) if project_identifier.present?
      errors << "projectIdentifier is unknown" if project_identifier.present? && project.nil?

      if node&.node_kind == WP_SECTION_KIND && project && node.scope_type == "project" && node.scope_id != project.id
        errors << "taxonomyCode does not belong to projectIdentifier"
      end

      {
        valid: errors.empty?,
        taxonomyCode: taxonomy_code,
        projectIdentifier: project_identifier,
        nodeKind: node&.node_kind,
        defaults: node ? { taxonomyCode: node.code, taxonomyNodeId: node.id } : {},
        errors:,
        warnings: []
      }
    end

    def serialize_node(node)
      {
        id: node.id,
        parentId: node.parent_id,
        scopeType: node.scope_type,
        scopeId: node.scope_id,
        nodeKind: node.node_kind,
        code: node.code,
        name: node.name,
        description: node.description,
        icon: node.icon,
        color: node.color,
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

    def find_project_title!(code)
      node = Node.active.find_by(code:, node_kind: PROJECT_TITLE_KINDS)
      raise TaxonomyError.new("titleCode is unknown", status: 404) unless node

      node
    end

    def find_wp_section!(code, project: nil)
      scope = Node.active.where(code:, node_kind: WP_SECTION_KIND)
      scope = scope.where(scope_type: "project", scope_id: project.id) if project
      node = scope.first
      raise TaxonomyError.new("sectionCode is unknown", status: 404) unless node

      node
    end

    def find_project!(identifier)
      project = Project.find_by(identifier:)
      raise TaxonomyError.new("projectIdentifier is unknown", status: 404) unless project

      project
    end

    def find_work_package!(id)
      work_package = WorkPackage.find_by(id:)
      raise TaxonomyError.new("workPackageId is unknown", status: 404) unless work_package

      work_package
    end

    def create_or_update_assignment!(node:, entity:, role:)
      assignment = Assignment.find_or_initialize_by(node:, entity:, role:)
      assignment.position ||= 0
      assignment.save!
      assignment
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

    def attach_default_types!(project)
      return if project.types.any?

      types = Type.default.presence || Type.order(:position).limit(3)
      project.types = types if types.any?
    end

    def parent_from_payload(payload)
      parent_code = fetch_value(payload, "parentCode", "parent_code")
      Node.find_by(code: parent_code) if parent_code.present?
    end

    def normalized_code(value, prefix, name)
      raw = value.to_s.strip
      return raw if raw.present?

      "#{prefix}.#{slug_or_timestamp(name)}"
    end

    def normalized_identifier(value, name)
      raw = value.to_s.strip.downcase
      return raw if raw.present?

      slug_or_timestamp(name)
    end

    def slug_or_timestamp(value)
      slug = value.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
      slug.presence || Time.zone.now.strftime("taxonomy-%Y%m%d%H%M%S")
    end

    def serialize_project_titles
      Node
        .active
        .where(node_kind: PROJECT_TITLE_KINDS)
        .ordered
        .map do |title|
          assignments = Assignment
            .where(node: title, entity_type: "Project", role: PROJECT_ASSIGNMENT_ROLES)
            .includes(:entity)
            .order(:position, :id)

          {
            title: serialize_node(title),
            projects: assignments.filter_map { |assignment| serialize_project(assignment.entity) if assignment.entity }
          }
        end
    end

    def serialize_wp_sections
      Node
        .active
        .where(node_kind: WP_SECTION_KIND)
        .ordered
        .map do |section|
          project = Project.find_by(id: section.scope_id) if section.scope_type == "project"
          assignments = Assignment
            .where(node: section, entity_type: "WorkPackage", role: WORK_PACKAGE_ASSIGNMENT_ROLES)
            .includes(entity: %i[project status type])
            .order(:position, :id)

          {
            section: serialize_node(section),
            project: project && serialize_project(project),
            workPackages: assignments.filter_map do |assignment|
              serialize_work_package(assignment.entity) if assignment.entity
            end
          }
        end
    end
  end
end
