# frozen_string_literal: true

module AbyzTaxonomy
  class Validation
    def self.validate(payload)
      taxonomy_code = fetch_value(payload, "taxonomyCode", "taxonomy_code")
      project_identifier = fetch_value(payload, "projectIdentifier", "project_identifier")

      errors = []
      errors << "taxonomyCode is required" if taxonomy_code.blank?
      errors << "projectIdentifier is required" if project_identifier.blank?

      node = Node.active.find_by(code: taxonomy_code) if taxonomy_code.present?
      errors << "taxonomyCode is unknown" if taxonomy_code.present? && node.nil?

      project = Project.find_by(identifier: project_identifier) if project_identifier.present?
      errors << "projectIdentifier is unknown" if project_identifier.present? && project.nil?

      {
        valid: errors.empty?,
        errors:,
        taxonomyCode: taxonomy_code,
        projectIdentifier: project_identifier,
        nodeId: node&.id,
        projectId: project&.id
      }
    end

    def self.fetch_value(payload, *keys)
      keys.each do |key|
        return payload[key] if payload.key?(key)

        symbol_key = key.to_sym
        return payload[symbol_key] if payload.key?(symbol_key)
      end

      nil
    end
  end
end
