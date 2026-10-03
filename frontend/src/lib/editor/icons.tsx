import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Atom, Award, Bell, Bookmark, BookOpen, Bot, Brain, Brush, Building2, Calendar, Camera, ChartColumn,
  ChartPie, Check, CircleHelp, Clock, Cloud, Code, Coffee, Cpu, Database, Flag, Flower2, Gift, Globe,
  GraduationCap, Hash, Heart, House, Image as ImageIcon, Info, Laptop, Leaf, Lightbulb, Link, Lock, Mail,
  MapPin, Megaphone, MessageCircle, Mic, Monitor, Moon, Music, Palette, PartyPopper, Pencil, Phone,
  Quote, Rocket, Search, Settings, Share2, Shield, ShoppingCart, Smartphone, Smile, Sparkles, Star, Sun,
  Target, ThumbsUp, TrendingUp, Trophy, User, Users, Video, Wifi, Zap, ArrowRight, ArrowLeft, ArrowUp,
  ArrowDown, X, Download, Plus,
  type LucideProps,
} from 'lucide-react';

/// คลังไอคอนของผืนผ้าใบ — มาจาก lucide-react (อยู่ใน whitelist · สัญญาอนุญาต ISC)
///
/// ตอนใส่ลงงาน แปลงเป็น SVG markup เก็บใน JSON state ตรง ๆ (element ชนิด svg)
/// เพื่อให้ CMS render ได้โดยไม่ต้องมี lucide · สีใช้ currentColor แล้วแทนตอนวาด

interface IconEntry {
  name: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

export const ICONS: IconEntry[] = [
  { name: 'star', label: 'ดาว', icon: Star },
  { name: 'heart', label: 'หัวใจ', icon: Heart },
  { name: 'check', label: 'เครื่องหมายถูก', icon: Check },
  { name: 'x', label: 'กากบาท', icon: X },
  { name: 'plus', label: 'บวก', icon: Plus },
  { name: 'arrow-right', label: 'ลูกศรขวา', icon: ArrowRight },
  { name: 'arrow-left', label: 'ลูกศรซ้าย', icon: ArrowLeft },
  { name: 'arrow-up', label: 'ลูกศรขึ้น', icon: ArrowUp },
  { name: 'arrow-down', label: 'ลูกศรลง', icon: ArrowDown },
  { name: 'graduation-cap', label: 'หมวกบัณฑิต', icon: GraduationCap },
  { name: 'book-open', label: 'หนังสือ', icon: BookOpen },
  { name: 'award', label: 'รางวัล', icon: Award },
  { name: 'trophy', label: 'ถ้วยรางวัล', icon: Trophy },
  { name: 'lightbulb', label: 'หลอดไฟ', icon: Lightbulb },
  { name: 'rocket', label: 'จรวด', icon: Rocket },
  { name: 'code', label: 'โค้ด', icon: Code },
  { name: 'laptop', label: 'แล็ปท็อป', icon: Laptop },
  { name: 'monitor', label: 'จอภาพ', icon: Monitor },
  { name: 'smartphone', label: 'มือถือ', icon: Smartphone },
  { name: 'cpu', label: 'ชิป', icon: Cpu },
  { name: 'database', label: 'ฐานข้อมูล', icon: Database },
  { name: 'cloud', label: 'คลาวด์', icon: Cloud },
  { name: 'wifi', label: 'ไวไฟ', icon: Wifi },
  { name: 'bot', label: 'หุ่นยนต์', icon: Bot },
  { name: 'brain', label: 'สมอง', icon: Brain },
  { name: 'atom', label: 'อะตอม', icon: Atom },
  { name: 'chart-column', label: 'กราฟแท่ง', icon: ChartColumn },
  { name: 'chart-pie', label: 'กราฟวงกลม', icon: ChartPie },
  { name: 'trending-up', label: 'แนวโน้มขึ้น', icon: TrendingUp },
  { name: 'target', label: 'เป้าหมาย', icon: Target },
  { name: 'calendar', label: 'ปฏิทิน', icon: Calendar },
  { name: 'clock', label: 'นาฬิกา', icon: Clock },
  { name: 'map-pin', label: 'หมุดแผนที่', icon: MapPin },
  { name: 'phone', label: 'โทรศัพท์', icon: Phone },
  { name: 'mail', label: 'อีเมล', icon: Mail },
  { name: 'globe', label: 'ลูกโลก', icon: Globe },
  { name: 'link', label: 'ลิงก์', icon: Link },
  { name: 'user', label: 'บุคคล', icon: User },
  { name: 'users', label: 'กลุ่มคน', icon: Users },
  { name: 'house', label: 'บ้าน', icon: House },
  { name: 'building', label: 'อาคาร', icon: Building2 },
  { name: 'megaphone', label: 'โทรโข่ง', icon: Megaphone },
  { name: 'message-circle', label: 'ข้อความ', icon: MessageCircle },
  { name: 'bell', label: 'กระดิ่ง', icon: Bell },
  { name: 'flag', label: 'ธง', icon: Flag },
  { name: 'bookmark', label: 'บุ๊กมาร์ก', icon: Bookmark },
  { name: 'quote', label: 'อัญประกาศ', icon: Quote },
  { name: 'info', label: 'ข้อมูล', icon: Info },
  { name: 'circle-help', label: 'คำถาม', icon: CircleHelp },
  { name: 'search', label: 'ค้นหา', icon: Search },
  { name: 'settings', label: 'ตั้งค่า', icon: Settings },
  { name: 'shield', label: 'โล่', icon: Shield },
  { name: 'lock', label: 'กุญแจ', icon: Lock },
  { name: 'share', label: 'แชร์', icon: Share2 },
  { name: 'download', label: 'ดาวน์โหลด', icon: Download },
  { name: 'camera', label: 'กล้อง', icon: Camera },
  { name: 'image', label: 'รูปภาพ', icon: ImageIcon },
  { name: 'video', label: 'วิดีโอ', icon: Video },
  { name: 'music', label: 'ดนตรี', icon: Music },
  { name: 'mic', label: 'ไมโครโฟน', icon: Mic },
  { name: 'palette', label: 'จานสี', icon: Palette },
  { name: 'brush', label: 'พู่กัน', icon: Brush },
  { name: 'pencil', label: 'ดินสอ', icon: Pencil },
  { name: 'sparkles', label: 'ประกาย', icon: Sparkles },
  { name: 'zap', label: 'สายฟ้า', icon: Zap },
  { name: 'sun', label: 'พระอาทิตย์', icon: Sun },
  { name: 'moon', label: 'พระจันทร์', icon: Moon },
  { name: 'leaf', label: 'ใบไม้', icon: Leaf },
  { name: 'flower', label: 'ดอกไม้', icon: Flower2 },
  { name: 'coffee', label: 'กาแฟ', icon: Coffee },
  { name: 'gift', label: 'ของขวัญ', icon: Gift },
  { name: 'party', label: 'งานฉลอง', icon: PartyPopper },
  { name: 'shopping-cart', label: 'รถเข็น', icon: ShoppingCart },
  { name: 'smile', label: 'ยิ้ม', icon: Smile },
  { name: 'thumbs-up', label: 'ถูกใจ', icon: ThumbsUp },
  { name: 'hash', label: 'แฮชแท็ก', icon: Hash },
];

/// SVG markup ของไอคอน · stroke ใช้ currentColor
export function iconSvg(entry: IconEntry): string {
  const markup = renderToStaticMarkup(
    createElement(entry.icon, { size: 96, color: 'currentColor', strokeWidth: 2 }),
  );

  return markup.includes('xmlns=')
    ? markup
    : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}
