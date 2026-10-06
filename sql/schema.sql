-- ============================================================
-- RetoPA — schema.sql (ESQUEMA CONSOLIDADO)
-- Generado desde producción con pg_dump --schema-only
-- Fecha base: 2026-06-09 | Reemplaza migraciones 001→035
-- ------------------------------------------------------------
-- Instalación desde cero:
--   docker exec -i retopa-db psql -U retopa -d retopa < sql/schema.sql
--   docker exec -i retopa-db psql -U retopa -d retopa < sql/seed.sql
-- El historial de migraciones viejas está en sql/archive/
-- ============================================================

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--


--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: EXTENSION fuzzystrmatch; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION fuzzystrmatch IS 'determine similarities and distance between strings';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_tiger_geocoder; Type: EXTENSION; Schema: -; Owner: -
--


--
-- Name: EXTENSION postgis_tiger_geocoder; Type: COMMENT; Schema: -; Owner: -
--


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: normalize_phone_py(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_py(raw text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    digits TEXT;
BEGIN
    IF raw IS NULL OR TRIM(raw) = '' THEN RETURN NULL; END IF;

    -- Limpiar: solo dígitos y el + inicial
    digits := regexp_replace(TRIM(raw), '[^0-9+]', '', 'g');

    -- Ya tiene código de país correcto → devolver normalizado con +
    IF digits LIKE '+595%' THEN
        RETURN '+' || regexp_replace(digits, '[^0-9]', '', 'g');
    END IF;

    -- Solo dígitos desde acá
    digits := regexp_replace(digits, '[^0-9]', '', 'g');

    -- Tiene otro código de país (no 595) → devolver sin tocar
    IF LENGTH(digits) >= 11 AND digits NOT LIKE '595%' AND digits NOT LIKE '0%' THEN
        RETURN raw; -- preservar original
    END IF;

    -- Empieza con 595 → agregar +
    IF digits LIKE '595%' THEN
        RETURN '+' || digits;
    END IF;

    -- Empieza con 0 (ej: 0981123456) → quitar 0, agregar +595
    IF digits LIKE '0%' THEN
        RETURN '+595' || SUBSTRING(digits FROM 2);
    END IF;

    -- Sin código (ej: 981123456, 9 dígitos) → agregar +595
    IF LENGTH(digits) BETWEEN 8 AND 10 THEN
        RETURN '+595' || digits;
    END IF;

    -- Cualquier otro caso → devolver original
    RETURN raw;
END;
$$;


--
-- Name: recalc_business_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalc_business_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE businesses 
    SET rating = (
        SELECT COALESCE(AVG(rating), 0) 
        FROM reviews 
        WHERE business_id = COALESCE(NEW.business_id, OLD.business_id) 
        AND is_approved = TRUE
    ),
    review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE business_id = COALESCE(NEW.business_id, OLD.business_id) 
        AND is_approved = TRUE
    )
    WHERE id = COALESCE(NEW.business_id, OLD.business_id);
    RETURN NEW;
END;
$$;


--
-- Name: update_like_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_like_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE businesses SET like_count = like_count + 1 WHERE id = NEW.business_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE businesses SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.business_id;
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id integer NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(100),
    role character varying(20) DEFAULT 'editor'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: admin_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_users_id_seq OWNED BY public.admin_users.id;


--
-- Name: business_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_categories (
    business_id integer NOT NULL,
    category_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: business_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_clicks (
    id integer NOT NULL,
    business_id integer NOT NULL,
    click_type character varying(20) DEFAULT 'whatsapp'::character varying,
    ip_hash character varying(64),
    clicked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: business_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_clicks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_clicks_id_seq OWNED BY public.business_clicks.id;


--
-- Name: business_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_gallery (
    id integer NOT NULL,
    business_id integer NOT NULL,
    image_url text NOT NULL,
    link_url text,
    link_label character varying(100),
    caption character varying(200),
    "position" smallint DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    price numeric(12,0),
    price_label character varying(50),
    description text,
    is_available boolean DEFAULT true
);


--
-- Name: business_gallery_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_gallery_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_gallery_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_gallery_id_seq OWNED BY public.business_gallery.id;


--
-- Name: business_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_likes (
    id integer NOT NULL,
    business_id integer NOT NULL,
    user_id integer,
    ip_hash character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: business_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_likes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_likes_id_seq OWNED BY public.business_likes.id;


--
-- Name: business_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_views (
    id integer NOT NULL,
    business_id integer NOT NULL,
    ip_hash character varying(64),
    referrer character varying(500),
    viewed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id integer NOT NULL,
    ruc character varying(50),
    name character varying(200) NOT NULL,
    slug character varying(200),
    category_id integer,
    description text,
    address text,
    city character varying(100),
    department character varying(100),
    phone character varying(50),
    email character varying(100),
    website character varying(200),
    logo_emoji character varying(10) DEFAULT '💼'::character varying,
    image_url text,
    rating numeric(2,1) DEFAULT 0,
    review_count integer DEFAULT 0,
    verified boolean DEFAULT false,
    plan_type character varying(20) DEFAULT 'basic'::character varying,
    hours text,
    tags text[],
    lat numeric(10,8),
    lng numeric(11,8),
    location public.geography(Point,4326),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cover_url text,
    like_count integer DEFAULT 0,
    trade_name character varying(255),
    whatsapp character varying(100),
    coord_is_real boolean DEFAULT false NOT NULL,
    social_instagram character varying(255),
    social_facebook character varying(255),
    social_tiktok character varying(255),
    social_linkedin character varying(255),
    social_twitter character varying(255),
    social_youtube character varying(255),
    source character varying(50) DEFAULT 'manual'::character varying,
    notified_at timestamp without time zone,
    notify_count integer DEFAULT 0,
    hours_json jsonb,
    ruc_parent character varying(50),
    claim_token character varying(64),
    claim_token_at timestamp without time zone,
    claim_expires_at timestamp without time zone,
    claim_status character varying(20) DEFAULT NULL::character varying,
    claimed_by integer,
    claimed_at timestamp without time zone,
    cover_focal_x smallint DEFAULT 50,
    cover_focal_y smallint DEFAULT 50
);


--
-- Name: COLUMN businesses.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.name IS 'Razón Social o nombre legal completo';


--
-- Name: COLUMN businesses.trade_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.trade_name IS 'Nombre comercial / Marca (lo que ve el público)';


--
-- Name: business_stats_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.business_stats_view AS
 SELECT b.id,
    b.slug,
    b.name,
    b.plan_type,
    b.verified,
    b.rating,
    b.review_count,
    COALESCE(b.like_count, 0) AS like_count,
    count(DISTINCT bv.id) FILTER (WHERE (bv.viewed_at >= (now() - '30 days'::interval))) AS views_30d,
    count(DISTINCT bv.id) FILTER (WHERE (bv.viewed_at >= (now() - '7 days'::interval))) AS views_7d,
    count(DISTINCT bc.id) FILTER (WHERE ((bc.clicked_at >= (now() - '30 days'::interval)) AND ((bc.click_type)::text = 'whatsapp'::text))) AS whatsapp_clicks_30d,
    count(DISTINCT bc.id) FILTER (WHERE ((bc.clicked_at >= (now() - '30 days'::interval)) AND ((bc.click_type)::text = 'phone'::text))) AS phone_clicks_30d
   FROM ((public.businesses b
     LEFT JOIN public.business_views bv ON ((bv.business_id = b.id)))
     LEFT JOIN public.business_clicks bc ON ((bc.business_id = b.id)))
  WHERE (b.is_active = true)
  GROUP BY b.id, b.slug, b.name, b.plan_type, b.verified, b.rating, b.review_count, b.like_count;


--
-- Name: business_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_views_id_seq OWNED BY public.business_views.id;


--
-- Name: businesses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.businesses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: businesses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.businesses_id_seq OWNED BY public.businesses.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    slug character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(50),
    color character varying(20),
    bg_color character varying(20),
    display_order integer DEFAULT 0,
    business_count integer DEFAULT 0,
    search_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    parent_id integer
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    department character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    lat numeric(10,8),
    lng numeric(11,8),
    is_active boolean DEFAULT true,
    search_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: email_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_log (
    id integer NOT NULL,
    to_email character varying(200) NOT NULL,
    subject character varying(300) NOT NULL,
    type character varying(50) DEFAULT 'general'::character varying NOT NULL,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    error text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: email_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_log_id_seq OWNED BY public.email_log.id;


--
-- Name: gallery_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_clicks (
    id integer NOT NULL,
    gallery_id integer NOT NULL,
    business_id integer NOT NULL,
    ip_hash character varying(64),
    clicked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gallery_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gallery_clicks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gallery_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gallery_clicks_id_seq OWNED BY public.gallery_clicks.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    subtitle character varying(200),
    price integer DEFAULT 0 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_featured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    button_label character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    max_categories integer DEFAULT 1 NOT NULL,
    max_gallery smallint DEFAULT 0 NOT NULL,
    max_social smallint DEFAULT 0 NOT NULL,
    max_tags smallint DEFAULT 5 NOT NULL,
    has_whatsapp boolean DEFAULT true NOT NULL,
    has_hours boolean DEFAULT false NOT NULL,
    has_gallery boolean DEFAULT false NOT NULL,
    has_map boolean DEFAULT false NOT NULL,
    has_social boolean DEFAULT false NOT NULL,
    has_reviews_reply boolean DEFAULT false NOT NULL,
    priority_boost smallint DEFAULT 0 NOT NULL,
    max_promotions smallint DEFAULT 0 NOT NULL
);


--
-- Name: promotion_boosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_boosts (
    id integer NOT NULL,
    promotion_id integer,
    business_id integer NOT NULL,
    boost_type character varying(20) NOT NULL,
    price_gs numeric(14,0) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    paid_at timestamp with time zone,
    paid_by integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT promotion_boosts_boost_type_check CHECK (((boost_type)::text = ANY ((ARRAY['boost_7d'::character varying, 'boost_15d'::character varying, 'boost_home_30d'::character varying])::text[]))),
    CONSTRAINT promotion_boosts_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: promotion_boosts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotion_boosts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotion_boosts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotion_boosts_id_seq OWNED BY public.promotion_boosts.id;


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id integer NOT NULL,
    business_id integer NOT NULL,
    title character varying(120) NOT NULL,
    description text,
    image_url character varying(500),
    original_price numeric(14,0),
    promo_price numeric(14,0),
    discount_pct smallint,
    price_label character varying(20) DEFAULT 'Gs.'::character varying,
    boost_type character varying(20) DEFAULT 'plan'::character varying NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    show_in_home boolean DEFAULT false NOT NULL,
    show_in_category boolean DEFAULT true NOT NULL,
    category_id integer,
    city character varying(100),
    clicks integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotions_boost_type_check CHECK (((boost_type)::text = ANY ((ARRAY['plan'::character varying, 'boost_7d'::character varying, 'boost_15d'::character varying, 'boost_home_30d'::character varying])::text[]))),
    CONSTRAINT promotions_discount_pct_check CHECK (((discount_pct >= 1) AND (discount_pct <= 99)))
);


--
-- Name: promotions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotions_id_seq OWNED BY public.promotions.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    business_id integer,
    author_name character varying(100),
    author_email character varying(100),
    rating integer,
    comment text,
    is_approved boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    owner_reply text,
    owner_replied_at timestamp without time zone,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: service_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_leads (
    id integer NOT NULL,
    business_id integer,
    service_type character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    contact_name character varying(100),
    contact_email character varying(100),
    contact_phone character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    business_name character varying(255),
    CONSTRAINT chk_lead_status CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'pending'::character varying, 'contacted'::character varying, 'negotiating'::character varying, 'won'::character varying, 'lost'::character varying, 'rejected'::character varying, 'completed'::character varying, 'closed'::character varying, 'claim'::character varying, 'follow_up'::character varying, 'verificado'::character varying, 'descartado'::character varying])::text[])))
);


--
-- Name: service_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_leads_id_seq OWNED BY public.service_leads.id;


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id integer NOT NULL,
    title character varying(100) NOT NULL,
    description text,
    icon character varying(50) DEFAULT 'fa-star'::character varying,
    icon_color character varying(20) DEFAULT 'text-brand-600'::character varying,
    icon_bg character varying(20) DEFAULT 'bg-brand-100'::character varying,
    features jsonb DEFAULT '[]'::jsonb,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cta_text character varying(100) DEFAULT 'Más información'::character varying,
    cta_url character varying(500)
);


--
-- Name: services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.services_id_seq OWNED BY public.services.id;


--
-- Name: site_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_config (
    key character varying(100) NOT NULL,
    value text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_businesses (
    id integer NOT NULL,
    user_id integer,
    business_id integer,
    is_owner boolean DEFAULT true,
    can_edit boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    delegated_at timestamp without time zone DEFAULT now(),
    delegated_by integer,
    notes text
);


--
-- Name: user_businesses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_businesses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_businesses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_businesses_id_seq OWNED BY public.user_businesses.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(100),
    phone character varying(50),
    role character varying(20) DEFAULT 'user'::character varying,
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    mfa_enabled boolean DEFAULT false,
    mfa_otp character varying(10),
    mfa_otp_expires timestamp without time zone,
    reset_token text,
    reset_token_expires timestamp without time zone,
    city character varying(120),
    verify_token text,
    verify_token_expires timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: v_claims_pending; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claims_pending AS
 SELECT b.id,
    b.name,
    b.trade_name,
    b.slug,
    b.email,
    b.phone,
    b.city,
    b.department,
    b.category_id,
    b.claim_token,
    b.claim_token_at,
    b.claim_expires_at,
    b.claim_status,
    b.claimed_at,
    b.verified,
    b.notify_count,
    b.notified_at,
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email
   FROM (public.businesses b
     LEFT JOIN public.users u ON ((u.id = b.claimed_by)))
  WHERE ((b.claim_status)::text = 'pending'::text)
  ORDER BY b.claimed_at DESC;


--
-- Name: admin_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users ALTER COLUMN id SET DEFAULT nextval('public.admin_users_id_seq'::regclass);


--
-- Name: business_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_clicks ALTER COLUMN id SET DEFAULT nextval('public.business_clicks_id_seq'::regclass);


--
-- Name: business_gallery id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_gallery ALTER COLUMN id SET DEFAULT nextval('public.business_gallery_id_seq'::regclass);


--
-- Name: business_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes ALTER COLUMN id SET DEFAULT nextval('public.business_likes_id_seq'::regclass);


--
-- Name: business_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_views ALTER COLUMN id SET DEFAULT nextval('public.business_views_id_seq'::regclass);


--
-- Name: businesses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses ALTER COLUMN id SET DEFAULT nextval('public.businesses_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: email_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log ALTER COLUMN id SET DEFAULT nextval('public.email_log_id_seq'::regclass);


--
-- Name: gallery_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_clicks ALTER COLUMN id SET DEFAULT nextval('public.gallery_clicks_id_seq'::regclass);


--
-- Name: promotion_boosts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_boosts ALTER COLUMN id SET DEFAULT nextval('public.promotion_boosts_id_seq'::regclass);


--
-- Name: promotions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions ALTER COLUMN id SET DEFAULT nextval('public.promotions_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: service_leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_leads ALTER COLUMN id SET DEFAULT nextval('public.service_leads_id_seq'::regclass);


--
-- Name: services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services ALTER COLUMN id SET DEFAULT nextval('public.services_id_seq'::regclass);


--
-- Name: user_businesses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses ALTER COLUMN id SET DEFAULT nextval('public.user_businesses_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: business_categories business_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_pkey PRIMARY KEY (business_id, category_id);


--
-- Name: business_clicks business_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_clicks
    ADD CONSTRAINT business_clicks_pkey PRIMARY KEY (id);


--
-- Name: business_gallery business_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_gallery
    ADD CONSTRAINT business_gallery_pkey PRIMARY KEY (id);


--
-- Name: business_likes business_likes_business_id_ip_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes
    ADD CONSTRAINT business_likes_business_id_ip_hash_key UNIQUE (business_id, ip_hash);


--
-- Name: business_likes business_likes_business_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes
    ADD CONSTRAINT business_likes_business_id_user_id_key UNIQUE (business_id, user_id);


--
-- Name: business_likes business_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes
    ADD CONSTRAINT business_likes_pkey PRIMARY KEY (id);


--
-- Name: business_views business_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_views
    ADD CONSTRAINT business_views_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_claim_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_claim_token_key UNIQUE (claim_token);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_slug_key UNIQUE (slug);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: cities cities_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_slug_key UNIQUE (slug);


--
-- Name: email_log email_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);


--
-- Name: gallery_clicks gallery_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_clicks
    ADD CONSTRAINT gallery_clicks_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: promotion_boosts promotion_boosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_boosts
    ADD CONSTRAINT promotion_boosts_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: service_leads service_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_leads
    ADD CONSTRAINT service_leads_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: site_config site_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_config
    ADD CONSTRAINT site_config_pkey PRIMARY KEY (key);


--
-- Name: user_businesses user_businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses
    ADD CONSTRAINT user_businesses_pkey PRIMARY KEY (id);


--
-- Name: user_businesses user_businesses_user_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses
    ADD CONSTRAINT user_businesses_user_id_business_id_key UNIQUE (user_id, business_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_bc_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bc_business ON public.business_categories USING btree (business_id);


--
-- Name: idx_bc_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bc_category ON public.business_categories USING btree (category_id);


--
-- Name: idx_businesses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_category ON public.businesses USING btree (category_id);


--
-- Name: idx_businesses_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_city ON public.businesses USING btree (city);


--
-- Name: idx_businesses_claim_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_claim_token ON public.businesses USING btree (claim_token) WHERE (claim_token IS NOT NULL);


--
-- Name: idx_businesses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_department ON public.businesses USING btree (department);


--
-- Name: idx_businesses_desc_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_desc_trgm ON public.businesses USING gin (description public.gin_trgm_ops);


--
-- Name: idx_businesses_latlng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_latlng ON public.businesses USING btree (lat, lng);


--
-- Name: idx_businesses_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_location ON public.businesses USING gist (location);


--
-- Name: idx_businesses_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_name_trgm ON public.businesses USING gin (name public.gin_trgm_ops);


--
-- Name: idx_businesses_notified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_notified ON public.businesses USING btree (notified_at);


--
-- Name: idx_businesses_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_plan ON public.businesses USING btree (plan_type);


--
-- Name: idx_businesses_plan_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_plan_rating ON public.businesses USING btree (plan_type, rating DESC);


--
-- Name: idx_businesses_ruc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_ruc ON public.businesses USING btree (ruc) WHERE (ruc IS NOT NULL);


--
-- Name: idx_businesses_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_verified ON public.businesses USING btree (verified);


--
-- Name: idx_categories_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_name_trgm ON public.categories USING gin (name public.gin_trgm_ops);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);


--
-- Name: idx_cities_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_department ON public.cities USING btree (department);


--
-- Name: idx_cities_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_name_trgm ON public.cities USING gin (name public.gin_trgm_ops);


--
-- Name: idx_clicks_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clicks_business ON public.business_clicks USING btree (business_id);


--
-- Name: idx_email_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_created ON public.email_log USING btree (created_at DESC);


--
-- Name: idx_email_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_status ON public.email_log USING btree (status);


--
-- Name: idx_email_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_type ON public.email_log USING btree (type);


--
-- Name: idx_gallery_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_business ON public.business_gallery USING btree (business_id, "position");


--
-- Name: idx_gallery_clicks_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_clicks_business ON public.gallery_clicks USING btree (business_id, clicked_at);


--
-- Name: idx_gallery_clicks_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_clicks_gallery ON public.gallery_clicks USING btree (gallery_id);


--
-- Name: idx_likes_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_business ON public.business_likes USING btree (business_id);


--
-- Name: idx_likes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_user ON public.business_likes USING btree (user_id);


--
-- Name: idx_promotions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_active ON public.promotions USING btree (is_active, expires_at);


--
-- Name: idx_promotions_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_business ON public.promotions USING btree (business_id);


--
-- Name: idx_promotions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_category ON public.promotions USING btree (category_id, is_active);


--
-- Name: idx_promotions_home; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_home ON public.promotions USING btree (show_in_home, is_active, expires_at);


--
-- Name: idx_service_leads_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_leads_business_id ON public.service_leads USING btree (business_id);


--
-- Name: idx_service_leads_business_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_leads_business_name ON public.service_leads USING btree (business_name);


--
-- Name: idx_service_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_leads_status ON public.service_leads USING btree (status);


--
-- Name: idx_users_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_reset_token ON public.users USING btree (reset_token) WHERE (reset_token IS NOT NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_views_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_views_business ON public.business_views USING btree (business_id);


--
-- Name: idx_views_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_views_date ON public.business_views USING btree (viewed_at);


--
-- Name: uq_bc_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_bc_primary ON public.business_categories USING btree (business_id) WHERE is_primary;


--
-- Name: business_likes trigger_like_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_like_count AFTER INSERT OR DELETE ON public.business_likes FOR EACH ROW EXECUTE FUNCTION public.update_like_count();


--
-- Name: reviews update_business_rating; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_rating AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.recalc_business_rating();


--
-- Name: businesses update_businesses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: plans update_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: services update_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_categories business_categories_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_categories business_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_categories
    ADD CONSTRAINT business_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: business_clicks business_clicks_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_clicks
    ADD CONSTRAINT business_clicks_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_gallery business_gallery_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_gallery
    ADD CONSTRAINT business_gallery_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_likes business_likes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes
    ADD CONSTRAINT business_likes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_likes business_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_likes
    ADD CONSTRAINT business_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_views business_views_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_views
    ADD CONSTRAINT business_views_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: businesses businesses_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: businesses businesses_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: gallery_clicks gallery_clicks_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_clicks
    ADD CONSTRAINT gallery_clicks_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: gallery_clicks gallery_clicks_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_clicks
    ADD CONSTRAINT gallery_clicks_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.business_gallery(id) ON DELETE CASCADE;


--
-- Name: promotion_boosts promotion_boosts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_boosts
    ADD CONSTRAINT promotion_boosts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: promotion_boosts promotion_boosts_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_boosts
    ADD CONSTRAINT promotion_boosts_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: promotion_boosts promotion_boosts_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_boosts
    ADD CONSTRAINT promotion_boosts_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;


--
-- Name: promotions promotions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: service_leads service_leads_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_leads
    ADD CONSTRAINT service_leads_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: user_businesses user_businesses_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses
    ADD CONSTRAINT user_businesses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: user_businesses user_businesses_delegated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses
    ADD CONSTRAINT user_businesses_delegated_by_fkey FOREIGN KEY (delegated_by) REFERENCES public.users(id);


--
-- Name: user_businesses user_businesses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_businesses
    ADD CONSTRAINT user_businesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

