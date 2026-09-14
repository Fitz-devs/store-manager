---
feature: category-management
status: delivered
updated: 2026-09-14
branch: main
commits: working tree
---

# Category Management

## Report

**What was built** — 分类独立表与多对多关联；我的 → 分类管理可增删改；商品编辑分类改为芯片多选，不再手填；列表筛选同时命中关联表与展示缓存。迁移已应用到远端，演示数据已挂上饮料/烟/零食。

**Verification** — API typecheck PASS；H5 build PASS；远端 migration 0009 PASS；categories/product PATCH 冒烟通过。

**Journey log**
- `products.category` 保留为展示缓存，避免列表大面积改 join
- 有商品引用的分类删除会被拒绝

## [S1] Problem

分类靠手填，口径不统一；一个商品只能一个分类。

## [S2] Design

- `categories` + `product_categories`
- `/api/categories` CRUD
- 商品 `category_ids[]`
- UI：分类管理页 + 商品多选芯片

## [S3] Out of Scope

- 分类排序/图标

## Tasks

- [x] T1: 迁移 + 类型 + categories API (covers: S2)
- [x] T2: 商品 category_ids 写读与筛选 (covers: S2)
- [x] T3: 分类管理页 + 商品编辑多选 (covers: S2)
- [x] T4: 迁移应用、构建部署与验证 (covers: S2)
