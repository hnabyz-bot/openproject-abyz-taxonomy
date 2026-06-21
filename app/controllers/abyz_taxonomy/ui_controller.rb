# frozen_string_literal: true

module AbyzTaxonomy
  class UiController < ApplicationController
    before_action :require_admin

    def tree
      render json: {
        _type: "AbyzTaxonomyUiTree",
        **TaxonomyService.tree
      }
    end

    def create_project_title
      node = TaxonomyService.create_project_title!(taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyProjectTitle",
        title: TaxonomyService.serialize_node(node)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_project
      project = TaxonomyService.create_project_under_title!(taxonomy_params, user: User.current)

      render json: {
        _type: "AbyzTaxonomyProject",
        project: TaxonomyService.serialize_project(project)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_wp_section
      node = TaxonomyService.create_wp_section!(taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyWpSection",
        section: TaxonomyService.serialize_node(node)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_work_package
      work_package = TaxonomyService.create_work_package_under_section!(taxonomy_params, user: User.current)

      render json: {
        _type: "AbyzTaxonomyWorkPackage",
        workPackage: TaxonomyService.serialize_work_package(work_package)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def update_node
      node = TaxonomyService.update_node!(params[:code], taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyNode",
        node: TaxonomyService.serialize_node(node)
      }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def delete_node
      node = TaxonomyService.delete_node!(params[:code])

      render json: {
        _type: "AbyzTaxonomyDeletedNode",
        code: node.code
      }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordNotDestroyed => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    private

    def taxonomy_params
      raw_params = request.request_parameters.presence || params.to_unsafe_h
      raw_params.except("controller", "action", "ui", "format")
    end

    def render_taxonomy_error(error)
      render json: {
        _type: "Error",
        message: error.message
      }, status: error.status
    end
  end
end
