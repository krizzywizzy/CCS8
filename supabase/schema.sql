-- Ace Prosthetics Hub - Supabase Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROSTHETICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prosthetics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('arm', 'leg', 'hand', 'other')),
  body_part TEXT NOT NULL CHECK (body_part IN ('upper', 'lower', 'other')),
  price_min DECIMAL(10, 2) NOT NULL,
  price_max DECIMAL(10, 2) NOT NULL,
  price DECIMAL(10, 2),
  description TEXT,
  image_url TEXT,
  comfort_rating INTEGER CHECK (comfort_rating >= 1 AND comfort_rating <= 5),
  durability_rating INTEGER CHECK (durability_rating >= 1 AND durability_rating <= 5),
  manufacturer TEXT,
  weight_kg DECIMAL(6, 2),
  beginner_friendly BOOLEAN DEFAULT false,
  reliability_rating INTEGER CHECK (reliability_rating >= 1 AND reliability_rating <= 5),
  category TEXT NOT NULL CHECK (category IN ('Cosmetic Prosthetics', 'Functional Prosthetics', 'Specialized Prosthetics')),
  features TEXT[] DEFAULT ARRAY[]::TEXT[],
  control_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIDEOS TABLE (Tutorials)
-- ============================================
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  transcript TEXT,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FORUM POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FORUM COMMENTS TABLE (supports nested replies)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keep backward compatibility: comments table maps to forum_comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILES TABLE (optional - for display names)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE prosthetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Prosthetics: public read
CREATE POLICY "Prosthetics are viewable by everyone" ON prosthetics FOR SELECT USING (true);

-- Videos: public read
CREATE POLICY "Videos are viewable by everyone" ON videos FOR SELECT USING (true);

-- Forum posts: public read, authenticated write
CREATE POLICY "Forum posts are viewable by everyone" ON forum_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create forum posts" ON forum_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own forum posts" ON forum_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own forum posts" ON forum_posts FOR DELETE USING (auth.uid() = user_id);

-- Forum comments: public read, authenticated write
CREATE POLICY "Forum comments are viewable by everyone" ON forum_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create forum comments" ON forum_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own forum comments" ON forum_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own forum comments" ON forum_comments FOR DELETE USING (auth.uid() = user_id);

-- Comments: public read, authenticated write
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles can be created (by trigger or user)" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id);

-- ============================================
-- STORAGE BUCKETS (run in Dashboard or via API)
-- Create buckets: images, videos, thumbnails
-- ============================================

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SAMPLE DATA (optional - remove in production)
-- ============================================
INSERT INTO prosthetics (name, type, body_part, price_min, price_max, price, description, comfort_rating, durability_rating, manufacturer, weight_kg, beginner_friendly, reliability_rating, category, features, control_type) VALUES
  ('Basic Myoelectric Arm', 'arm', 'upper', 3200.00, 4500.00, 3500.00, 'Entry-level myoelectric prosthetic arm for above-elbow amputees with smooth movement and reliable grip.', 4, 4, 'Open Bionics', 0.45, true, 4, 'Functional Prosthetics', ARRAY['Adaptive', 'Sports'], 'Myoelectric'),
  ('Prosthetic Hand Model X', 'hand', 'upper', 2500.00, 3200.00, 2800.00, 'Lightweight prosthetic hand with multiple grip patterns suitable for daily activities.', 5, 4, 'Ottobock', 0.35, true, 5, 'Cosmetic Prosthetics', ARRAY['Swimwear'], 'Body-Powered'),
  ('Below-Knee Prosthesis', 'leg', 'lower', 3800.00, 5000.00, 4200.00, 'Comfortable below-knee prosthesis designed for daily mobility and outdoor activities.', 4, 5, 'Össur', 1.2, true, 5, 'Functional Prosthetics', ARRAY['Sports', 'Adaptive'], 'Hydraulic'),
  ('Advanced Bionic Arm', 'arm', 'upper', 7500.00, 9200.00, 8500.00, 'Advanced multi-articulating arm with sensory feedback for precise control and natural movement.', 5, 5, 'Touch Bionics', 0.5, false, 5, 'Specialized Prosthetics', ARRAY['Adaptive'], 'Advanced Neural Interface'),
  ('Cosmetic Hand Restoration', 'hand', 'upper', 1800.00, 2500.00, 2000.00, 'Aesthetic prosthetic hand designed to match natural appearance and skin tone.', 5, 3, 'Össur', 0.4, true, 4, 'Cosmetic Prosthetics', ARRAY['Other'], 'Passive'),
  ('Above-Knee Prosthesis', 'leg', 'lower', 5000.00, 7200.00, 6000.00, 'Above-knee prosthesis with microprocessor-controlled knee for natural walking patterns.', 4, 5, 'Össur', 1.5, false, 5, 'Functional Prosthetics', ARRAY['Sports'], 'Microprocessor Controlled');


INSERT INTO videos (title, description, video_url, thumbnail_url, transcript, category) VALUES
  ('Introduction to Prosthetics', 'Learn the basics of prosthetic devices and how they work.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '', 'This is a sample transcript for the introduction video.', 'Getting Started'),
  ('Caring for Your Prosthetic', 'Daily care and maintenance tips for your prosthetic device.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '', 'Transcript: Caring for your prosthetic is essential for longevity.', 'Care & Maintenance'),
  ('Upper Limb Options Explained', 'Overview of upper limb prosthetic options including myoelectric and body-powered.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '', 'Transcript: Upper limb prosthetics come in many forms.', 'Upper Limb')
);
