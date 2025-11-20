import { NextRequest, NextResponse } from 'next/server'
import { setupPayments } from '../../../../lib/filecoin'
import { ethers } from 'ethers'

// Vercel serverless function configuration
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * API route to handle Filecoin payments using server-side private key
 * This removes the need for users to add Filecoin network to MetaMask
 * 
 * Flow:
 * 1. User pays in Base via MetaMask
 * 2. This API receives the payment details
 * 3. Server uses private key to make equivalent Filecoin payment
 * 4. Returns Filecoin transaction details
 */
export async function POST(request: NextRequest) {
  try {
    const { baseAmount, filecoinAddress, estimatedSizeBytes, durationDays } = await request.json()

    // Validate inputs
    if (!baseAmount || !filecoinAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: baseAmount, filecoinAddress' },
        { status: 400 }
      )
    }

    // Validate Filecoin address format
    if (!ethers.isAddress(filecoinAddress)) {
      return NextResponse.json(
        { error: 'Invalid Filecoin address format' },
        { status: 400 }
      )
    }

    console.log('[Filecoin Payment] Processing payment:', {
      baseAmount,
      filecoinAddress,
      estimatedSizeBytes,
      durationDays
    })

    // Setup Filecoin payments using server private key
    // This calls setupPayments which handles deposits and approvals
    const result = await setupPayments(
      estimatedSizeBytes || 100 * 1024 * 1024, // Default 100MB
      durationDays || 30 // Default 30 days
    )

    console.log('[Filecoin Payment] Payment setup complete')

    return NextResponse.json({
      success: true,
      message: 'Filecoin payment processed successfully',
      deposited: result.deposited,
      approved: result.approved,
      filecoinAddress,
      baseAmount
    })

  } catch (error: any) {
    console.error('[Filecoin Payment] Error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to process Filecoin payment',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

