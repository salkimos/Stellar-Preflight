//! Minimal SEP-41 token used by the preflight testnet examples.
//!
//! It adds one custom rule on top of the standard interface: the admin can
//! freeze an address, after which it can neither send nor receive. That gives
//! preflight a real case where only a transfer simulation can catch the problem.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, contracterror, Address, Env, MuxedAddress, String};

#[contracttype]
enum Key {
    Admin,
    Balance(Address),
    Allowance(Address, Address),
    Frozen(Address),
}

#[contracterror]
#[derive(Copy, Clone)]
#[repr(u32)]
pub enum Error {
    InsufficientBalance = 1,
    InsufficientAllowance = 2,
    Frozen = 3,
    NegativeAmount = 4,
}

#[contract]
pub struct DemoToken;

fn balance_of(env: &Env, id: &Address) -> i128 {
    env.storage().persistent().get(&Key::Balance(id.clone())).unwrap_or(0)
}

fn set_balance(env: &Env, id: &Address, amount: i128) {
    env.storage().persistent().set(&Key::Balance(id.clone()), &amount);
}

fn check_frozen(env: &Env, id: &Address) {
    if env.storage().persistent().has(&Key::Frozen(id.clone())) {
        panic_with_error!(env, Error::Frozen);
    }
}

fn move_funds(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount < 0 {
        panic_with_error!(env, Error::NegativeAmount);
    }
    check_frozen(env, from);
    check_frozen(env, to);
    let have = balance_of(env, from);
    if have < amount {
        panic_with_error!(env, Error::InsufficientBalance);
    }
    set_balance(env, from, have - amount);
    set_balance(env, to, balance_of(env, to) + amount);
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Key::Admin).unwrap()
}

#[contractimpl]
impl DemoToken {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&Key::Admin, &admin);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        admin(&env).require_auth();
        set_balance(&env, &to, balance_of(&env, &to) + amount);
    }

    pub fn freeze(env: Env, id: Address) {
        admin(&env).require_auth();
        env.storage().persistent().set(&Key::Frozen(id), &true);
    }

    // SEP-41

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage().temporary().get(&Key::Allowance(from, spender)).unwrap_or(0)
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        let key = Key::Allowance(from, spender);
        env.storage().temporary().set(&key, &amount);
        let ttl = expiration_ledger.saturating_sub(env.ledger().sequence());
        if ttl > 0 {
            env.storage().temporary().extend_ttl(&key, ttl, ttl);
        }
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        balance_of(&env, &id)
    }

    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        move_funds(&env, &from, &to.address(), amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowed < amount {
            panic_with_error!(&env, Error::InsufficientAllowance);
        }
        env.storage().temporary().set(&Key::Allowance(from.clone(), spender), &(allowed - amount));
        move_funds(&env, &from, &to, amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::burn_unchecked(&env, &from, amount);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        let allowed = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowed < amount {
            panic_with_error!(&env, Error::InsufficientAllowance);
        }
        env.storage().temporary().set(&Key::Allowance(from.clone(), spender), &(allowed - amount));
        Self::burn_unchecked(&env, &from, amount);
    }

    pub fn decimals(_env: Env) -> u32 {
        6
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Preflight Demo Token")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "PFD")
    }
}

impl DemoToken {
    fn burn_unchecked(env: &Env, from: &Address, amount: i128) {
        let have = balance_of(env, from);
        if have < amount {
            panic_with_error!(env, Error::InsufficientBalance);
        }
        set_balance(env, from, have - amount);
    }
}
