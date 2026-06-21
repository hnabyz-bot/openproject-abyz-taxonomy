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

    def edit_node
      @node = TaxonomyService.find_node!(params[:code])
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
    rescue TaxonomyError => e
      render plain: e.message, status: e.status
    end

    def update_node_settings
      node = TaxonomyService.update_node!(params[:code], taxonomy_settings_params)

      redirect_to node_settings_path(node), notice: "#{taxonomy_label(node)} 세부 정보가 업데이트되었습니다."
    rescue TaxonomyError => e
      @node = TaxonomyService.find_node!(params[:code])
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
      flash.now[:error] = e.message
      render :edit_node, status: e.status
    rescue ActiveRecord::RecordInvalid => e
      @node = e.record
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
      flash.now[:error] = e.record.errors.full_messages.join(", ")
      render :edit_node, status: :unprocessable_entity
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
        code: node.code,
        active: node.active
      }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    private

    def taxonomy_params
      raw_params = request.request_parameters.presence || params.to_unsafe_h
      raw_params.except("controller", "action", "ui", "format")
    end

    def taxonomy_settings_params
      raw = params.fetch(:node, {}).to_unsafe_h
      {
        "name" => raw["name"],
        "code" => raw["code"],
        "description" => raw["description"],
        "taxonomyType" => raw["taxonomy_type"]
      }.compact
    end

    def node_settings_path(node)
      "/abyz_taxonomy/ui/nodes/#{ERB::Util.url_encode(node.code)}/settings/general"
    end

    def node_back_path(node)
      if node.node_kind == TaxonomyService::WP_SECTION_KIND && node.scope_id
        project = Project.find_by(id: node.scope_id)
        return "/projects/#{project.identifier}/work_packages" if project
      end

      "/projects"
    end

    def taxonomy_label(node)
      taxonomy_type = node.rules_json && node.rules_json["taxonomyType"]

      return "포트폴리오" if taxonomy_type == "portfolio"
      return "프로그램" if taxonomy_type == "program"
      return "섹션" if node.node_kind == TaxonomyService::WP_SECTION_KIND

      "타이틀"
    end

    def render_taxonomy_error(error)
      render json: {
        _type: "Error",
        message: error.message
      }, status: error.status
    end
  end
end
