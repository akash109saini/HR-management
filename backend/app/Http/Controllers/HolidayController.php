<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Holiday;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = Holiday::query();
        
        if ($year = $request->query('year')) {
            $query->whereYear('date', $year);
        }

        return response()->json($query->orderBy('date', 'asc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['name' => 'required', 'date' => 'required|date']);

        $holiday = Holiday::create([
            'name' => $request->name,
            'date' => $request->date,
            'type' => $request->type ?? 'public',
            'description' => $request->description ?? '',
        ]);

        return response()->json($holiday, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $holiday = Holiday::find($id);
        if (!$holiday) {
            return response()->json(['detail' => 'Holiday not found'], 404);
        }

        $updates = array_filter($request->only(['name', 'date', 'type', 'description']), fn($v) => $v !== null);
        $holiday->update($updates);

        return response()->json($holiday->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Holiday::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
