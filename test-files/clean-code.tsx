// Clean code example - should receive positive feedback
import React, { useCallback, useMemo, memo } from 'react';

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly isActive: boolean;
}

interface UserListProps {
  readonly users: readonly User[];
  readonly onUserSelect: (user: User) => void;
  readonly searchQuery?: string;
}

const UserList = memo<UserListProps>(({ users, onUserSelect, searchQuery = '' }) => {
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    
    return users.filter(user => 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const handleUserClick = useCallback((user: User) => {
    onUserSelect(user);
  }, [onUserSelect]);

  if (filteredUsers.length === 0) {
    return (
      <div className="empty-state" role="status">
        <p>No users found</p>
      </div>
    );
  }

  return (
    <div className="user-list" role="list">
      {filteredUsers.map(user => (
        <UserCard 
          key={user.id}
          user={user}
          onClick={handleUserClick}
        />
      ))}
    </div>
  );
});

UserList.displayName = 'UserList';

interface UserCardProps {
  readonly user: User;
  readonly onClick: (user: User) => void;
}

const UserCard = memo<UserCardProps>(({ user, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(user);
  }, [user, onClick]);

  return (
    <div 
      className={`user-card ${user.isActive ? 'active' : 'inactive'}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <span className="status">
        {user.isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
});

UserCard.displayName = 'UserCard';

export { UserList };
export type { User, UserListProps };
