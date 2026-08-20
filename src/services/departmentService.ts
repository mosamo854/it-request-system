import { supabase } from "../lib/supabase";
import type { Department } from "../types/department";

interface DepartmentRow {
  id: string;
  name: string;
  created_at: string;
}

function mapDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function getDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as DepartmentRow[]).map(mapDepartment);
}

export async function createDepartment(name: string): Promise<Department> {
  const normalizedName = name.trim();

  if (normalizedName.length < 2 || normalizedName.length > 80) {
    throw new Error("ชื่อแผนกต้องมี 2–80 ตัวอักษร");
  }

  if (normalizedName === "ทุกแผนก") {
    throw new Error("ชื่อนี้สงวนไว้สำหรับตัวกรองคำขอ");
  }

  const { data, error } = await supabase
    .from("departments")
    .insert({ name: normalizedName })
    .select("*")
    .single();

  if (error?.code === "23505") throw new Error("มีแผนกนี้อยู่แล้ว");
  if (error) throw error;
  return mapDepartment(data as DepartmentRow);
}
